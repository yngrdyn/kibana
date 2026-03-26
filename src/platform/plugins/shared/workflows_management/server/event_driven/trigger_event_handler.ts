/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import pLimit from 'p-limit';
import type { AnalyticsServiceStart, Logger } from '@kbn/core/server';
import type { WorkflowDetailDto, WorkflowExecutionEngineModel } from '@kbn/workflows';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import type {
  EventChainContext,
  TriggerEventHandlerParams,
} from '@kbn/workflows-extensions/server';
import type {
  ResolveMatchingWorkflowSubscriptionsParams,
  ResolveMatchingWorkflowSubscriptionsResult,
  TriggerResolutionStats,
} from './resolve_workflow_subscriptions';
import type { WorkflowsManagementApi } from '../api/workflows_management_api';
import { validateWorkflowForExecution } from '../connectors/workflows/validate_workflow_for_execution';
import {
  type TriggerEventDispatchedTelemetryEvent,
  WORKFLOWS_TRIGGER_EVENT_DISPATCHED,
} from '../telemetry/events';
import { type TriggerEventsDataStreamClient, writeTriggerEvent } from '../trigger_events_log';

const SCHEDULE_CONCURRENCY = 20;

async function writeTriggerEvents(
  client: TriggerEventsDataStreamClient | null,
  logEventsEnabled: boolean,
  params: {
    timestamp: string;
    triggerId: string;
    spaceId: string;
    subscriptions: string[];
    payload: Record<string, unknown>;
  },
  logger: Logger
): Promise<void> {
  if (!client || !logEventsEnabled) {
    return;
  }
  try {
    await writeTriggerEvent(client, params);
  } catch (error) {
    logger.warn(
      `Failed to write trigger event to data stream (trigger: ${params.triggerId}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

interface ScheduleEventParams {
  payload: Record<string, unknown>;
  timestamp: string;
  spaceId: string;
  eventChainContext?: EventChainContext;
  triggerId: string;
}

function getEventContextForScheduledWorkflow(
  workflow: WorkflowDetailDto,
  eventParams: ScheduleEventParams,
  maxEventChainDepth: number,
  logger: Logger
): Record<string, unknown> | null {
  const { payload, timestamp, spaceId, eventChainContext, triggerId } = eventParams;
  const newDepth = (eventChainContext?.depth ?? -1) + 1;
  if (newDepth > maxEventChainDepth) {
    logger.warn(
      `Event chain depth (${newDepth}) exceeds max (${maxEventChainDepth}); skipping workflow ${workflow.id} (trigger: ${triggerId}, space: ${spaceId}) to prevent unbounded chains.`
    );
    return null;
  }
  return { ...payload, timestamp, spaceId, eventChainDepth: newDepth };
}

/** Scheduling outcomes after KQL-matched workflows are considered. */
export interface TriggerEventScheduleStats {
  depthSkippedCount: number;
  scheduledAttemptCount: number;
  scheduledSuccessCount: number;
  scheduledFailureCount: number;
}

const emptyScheduleStats = (): TriggerEventScheduleStats => ({
  depthSkippedCount: 0,
  scheduledAttemptCount: 0,
  scheduledSuccessCount: 0,
  scheduledFailureCount: 0,
});

const emptyResolutionStats = (): TriggerResolutionStats => ({
  subscribedCount: 0,
  disabledCount: 0,
  kqlFalseCount: 0,
  kqlErrorCount: 0,
  matchedCount: 0,
});

async function scheduleMatchingWorkflows(
  api: WorkflowsManagementApi,
  workflows: WorkflowDetailDto[],
  spaceId: string,
  eventParams: ScheduleEventParams,
  maxEventChainDepth: number,
  request: TriggerEventHandlerParams['request'],
  logger: Logger
): Promise<TriggerEventScheduleStats> {
  if (workflows.length === 0) {
    return emptyScheduleStats();
  }
  const scheduleConcurrency = pLimit(SCHEDULE_CONCURRENCY);
  const schedulePromises = workflows.map((workflow) =>
    scheduleConcurrency(async (): Promise<'depth_skipped' | 'success' | 'failure'> => {
      const eventContext = getEventContextForScheduledWorkflow(
        workflow,
        eventParams,
        maxEventChainDepth,
        logger
      );
      if (eventContext === null) {
        return 'depth_skipped';
      }
      try {
        validateWorkflowForExecution(workflow, workflow.id);
        const workflowToRun: WorkflowExecutionEngineModel = {
          id: workflow.id,
          name: workflow.name,
          enabled: workflow.enabled,
          definition: workflow.definition,
          yaml: workflow.yaml,
        };
        await api.scheduleWorkflow(
          workflowToRun,
          spaceId,
          { event: eventContext },
          request,
          eventParams.triggerId,
          {
            eventDispatchTimestamp: eventParams.timestamp,
            eventTriggerId: eventParams.triggerId,
          }
        );
        return 'success';
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        logger.warn(
          `Event-driven workflow scheduling failed for workflow ${workflow.id} (trigger: ${eventParams.triggerId}): ${message}`
        );
        return 'failure';
      }
    })
  );
  const outcomes = await Promise.all(schedulePromises);
  const stats = emptyScheduleStats();
  for (const outcome of outcomes) {
    if (outcome === 'depth_skipped') {
      stats.depthSkippedCount += 1;
    } else {
      stats.scheduledAttemptCount += 1;
      if (outcome === 'success') {
        stats.scheduledSuccessCount += 1;
      } else {
        stats.scheduledFailureCount += 1;
      }
    }
  }
  return stats;
}

export interface CreateTriggerEventHandlerParams {
  api: WorkflowsManagementApi;
  logger: Logger;
  getAnalytics?: () => AnalyticsServiceStart | undefined;
  getTriggerEventsClient: () => TriggerEventsDataStreamClient | null;
  getWorkflowExecutionEngine: () => Promise<WorkflowsExecutionEnginePluginStart>;
  resolveMatchingWorkflowSubscriptions: (
    params: ResolveMatchingWorkflowSubscriptionsParams
  ) => Promise<ResolveMatchingWorkflowSubscriptionsResult>;
}

/**
 * Creates the trigger event handler that runs when emitEvent is called.
 * Writes the event to the trigger-events data stream (audit), then resolves workflows
 * subscribed to the trigger and schedules each via Task Manager (workflow:run task).
 * Uses the request from emitEvent so executions are attributed to the calling user.
 * Scheduling is capped with p-limit to avoid ES/TM overload when many workflows match.
 */
export function createTriggerEventHandler({
  api,
  logger,
  getAnalytics,
  getTriggerEventsClient,
  getWorkflowExecutionEngine,
  resolveMatchingWorkflowSubscriptions,
}: CreateTriggerEventHandlerParams): (params: TriggerEventHandlerParams) => Promise<void> {
  const reportDispatchedEvent = (event: TriggerEventDispatchedTelemetryEvent): void => {
    try {
      getAnalytics?.()?.reportEvent(WORKFLOWS_TRIGGER_EVENT_DISPATCHED, event);
    } catch (error) {
      logger.warn(
        `Failed to report ${WORKFLOWS_TRIGGER_EVENT_DISPATCHED} telemetry: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  return async (params: TriggerEventHandlerParams): Promise<void> => {
    const engine = await getWorkflowExecutionEngine();
    const executionEnabled = engine.isEventDrivenExecutionEnabled();
    const logEventsEnabled = engine.isLogTriggerEventsEnabled();
    const baseTelemetry = {
      triggerId: params.triggerId,
      executionEnabled,
      logEventsEnabled,
    };

    if (!executionEnabled && !logEventsEnabled) {
      logger.debug(
        'Event-driven execution is disabled (eventDrivenExecutionEnabled: false); skipping workflow scheduling.'
      );
      reportDispatchedEvent({
        ...baseTelemetry,
        earlyExit: true,
        auditOnly: false,
        ...emptyResolutionStats(),
        ...emptyScheduleStats(),
      });
      return;
    }

    const { timestamp, triggerId, payload, request, spaceId, eventChainContext } = params;

    const eventContextForResolution = { ...payload, timestamp, spaceId, eventChainDepth: 0 };
    const { workflows, stats: resolutionStats } = await resolveMatchingWorkflowSubscriptions({
      triggerId,
      spaceId,
      eventContext: eventContextForResolution,
    });
    logger.trace(
      `Workflows trigger resolution funnel: triggerId=${triggerId} ${JSON.stringify(
        resolutionStats
      )}`
    );
    const subscriptions = workflows.map((w) => w.id);

    await writeTriggerEvents(
      getTriggerEventsClient(),
      logEventsEnabled,
      { timestamp, triggerId, spaceId, subscriptions, payload },
      logger
    );

    let scheduleStats = emptyScheduleStats();
    if (executionEnabled && workflows.length > 0) {
      const maxEventChainDepth = engine.getMaxEventChainDepth();
      scheduleStats = await scheduleMatchingWorkflows(
        api,
        workflows,
        spaceId,
        { payload, timestamp, spaceId, eventChainContext, triggerId },
        maxEventChainDepth,
        request,
        logger
      );
      logger.trace(
        `Workflows trigger schedule outcomes: triggerId=${triggerId} ${JSON.stringify(
          scheduleStats
        )}`
      );
    }
    reportDispatchedEvent({
      ...baseTelemetry,
      earlyExit: false,
      auditOnly: !executionEnabled && logEventsEnabled,
      ...resolutionStats,
      ...scheduleStats,
    });
  };
}
