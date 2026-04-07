/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import pLimit from 'p-limit';
import { v4 as generateUuid } from 'uuid';
import type { Logger } from '@kbn/core/server';
import type {
  EsWorkflowExecution,
  WorkflowDetailDto,
  WorkflowExecutionDto,
  WorkflowExecutionEngineModel,
} from '@kbn/workflows';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import {
  extractEventChainDepthFromExecution,
  extractEventChainVisitedWorkflowIdsFromExecution,
} from '@kbn/workflows-execution-engine/server/lib/telemetry/utils/extract_execution_metadata';
import {
  type EventChainContext,
  getEmitterWorkflowExecutionIdFromRequest,
  type TriggerEventHandlerParams,
} from '@kbn/workflows-extensions/server';
import type {
  ResolveMatchingWorkflowSubscriptionsParams,
  ResolveMatchingWorkflowSubscriptionsResult,
} from './resolve_workflow_subscriptions';
import {
  createEmptyTriggerScheduleStats,
  type TriggerEventScheduleStats,
} from './trigger_event_stats';
import type { WorkflowsManagementApi } from '../api/workflows_management_api';
import { validateWorkflowForExecution } from '../connectors/workflows/validate_workflow_for_execution';
import { type TriggerEventDispatchedTelemetryEvent } from '../telemetry/events';
import type { WorkflowsManagementTelemetryClient } from '../telemetry/workflows_management_telemetry_client';
import { type TriggerEventsDataStreamClient, writeTriggerEvent } from '../trigger_events_log';

const SCHEDULE_CONCURRENCY = 20;

async function writeTriggerEvents(
  client: TriggerEventsDataStreamClient | null,
  logEventsEnabled: boolean,
  params: {
    timestamp: string;
    eventId: string;
    triggerId: string;
    spaceId: string;
    subscriptions: string[];
    payload: Record<string, unknown>;
    sourceExecutionId?: string;
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
  eventId: string;
  eventChainContext?: EventChainContext;
  triggerId: string;
}

function eventChainContextFromExecutionDto(
  doc: WorkflowExecutionDto,
  maxEventChainDepth: number
): EventChainContext {
  const esLike = doc as unknown as EsWorkflowExecution;
  return {
    depth: extractEventChainDepthFromExecution(esLike) ?? -1,
    sourceWorkflowId: doc.workflowId,
    visitedWorkflowIds: extractEventChainVisitedWorkflowIdsFromExecution(
      esLike,
      maxEventChainDepth
    ),
  };
}

async function resolveEventChainContextFromEmitterExecution(
  api: WorkflowsManagementApi,
  request: TriggerEventHandlerParams['request'],
  spaceId: string,
  logger: Logger,
  maxEventChainDepth: number
): Promise<EventChainContext | undefined> {
  const executionId = getEmitterWorkflowExecutionIdFromRequest(request);
  if (executionId === undefined) {
    return undefined;
  }
  try {
    const doc = await api.getWorkflowExecution(executionId, spaceId);
    if (!doc?.workflowId) {
      return undefined;
    }
    const context = eventChainContextFromExecutionDto(doc, maxEventChainDepth);
    logger.debug(
      `[workflows:eventChain] restored chain from emitter execution: executionId=${executionId} context=${JSON.stringify(
        context
      )}`
    );
    return context;
  } catch (error) {
    logger.warn(
      `Failed to load emitter workflow execution ${executionId} for event-chain context: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

/**
 * True when the emit carried event-chain context (workflow run or restored from emitter execution).
 * Undefined context means a non-workflow-attributed emit path.
 */
function isWorkflowSourcedChainContext(context: EventChainContext | undefined): boolean {
  return context !== undefined;
}

function getMatchingTriggerOn(
  workflow: WorkflowDetailDto,
  triggerId: string
): Record<string, unknown> | null {
  const matchingTrigger = workflow.definition?.triggers?.find(
    (t) => t != null && typeof t === 'object' && 'type' in t && t.type === triggerId
  );
  if (
    matchingTrigger == null ||
    typeof matchingTrigger !== 'object' ||
    !('on' in matchingTrigger) ||
    matchingTrigger.on == null ||
    typeof matchingTrigger.on !== 'object' ||
    Array.isArray(matchingTrigger.on)
  ) {
    return null;
  }
  return matchingTrigger.on as Record<string, unknown>;
}

function buildNextVisitedWorkflowIds(context: EventChainContext | undefined): string[] {
  const prev =
    context?.visitedWorkflowIds?.filter(
      (id): id is string => typeof id === 'string' && id !== ''
    ) ?? [];
  const emitter = context?.sourceWorkflowId;
  if (emitter === undefined || emitter === '') {
    return prev;
  }
  if (prev.length > 0 && prev[prev.length - 1] === emitter) {
    return prev;
  }
  return [...prev, emitter];
}

function getTriggerAllowsRecursiveTriggers(
  workflow: WorkflowDetailDto,
  triggerId: string
): boolean {
  const on = getMatchingTriggerOn(workflow, triggerId);
  return on?.allowRecursiveTriggers === true;
}

function getTriggerSkipWorkflowEmits(workflow: WorkflowDetailDto, triggerId: string): boolean {
  const on = getMatchingTriggerOn(workflow, triggerId);
  return on?.skipWorkflowEmits === true;
}

type ScheduleContextSkipReason = 'skip_workflow_emit' | 'depth' | 'cycle';

function getEventContextForScheduledWorkflow(
  workflow: WorkflowDetailDto,
  eventParams: ScheduleEventParams,
  maxEventChainDepth: number,
  logger: Logger
):
  | { outcome: 'scheduled'; event: Record<string, unknown> }
  | { outcome: 'skipped'; reason: ScheduleContextSkipReason } {
  const { payload, timestamp, spaceId, eventChainContext, triggerId } = eventParams;

  if (
    getTriggerSkipWorkflowEmits(workflow, triggerId) &&
    isWorkflowSourcedChainContext(eventChainContext)
  ) {
    logger.warn(
      `Skip workflow emit guard skipped scheduling workflow ${workflow.id} for trigger ${triggerId} in space ${spaceId}; on.skipWorkflowEmits is true and this event was emitted from a workflow execution.`
    );
    return { outcome: 'skipped', reason: 'skip_workflow_emit' };
  }

  const newDepth = (eventChainContext?.depth ?? -1) + 1;
  if (newDepth > maxEventChainDepth) {
    logger.warn(
      `Event chain depth (${newDepth}) exceeds max (${maxEventChainDepth}); skipping workflow ${workflow.id} (trigger: ${triggerId}, space: ${spaceId}) to prevent unbounded chains.`
    );
    return { outcome: 'skipped', reason: 'depth' };
  }

  const allowsRecursiveTriggers = getTriggerAllowsRecursiveTriggers(workflow, triggerId);
  if (!allowsRecursiveTriggers) {
    const nextVisited = buildNextVisitedWorkflowIds(eventChainContext);
    if (nextVisited.includes(workflow.id)) {
      logger.warn(
        `Event chain cycle guard skipped scheduling workflow ${
          workflow.id
        } for trigger ${triggerId} in space ${spaceId}; workflow already in chain [${nextVisited.join(
          ', '
        )}]. Set on.allowRecursiveTriggers: true on this trigger to allow repeats.`
      );
      return { outcome: 'skipped', reason: 'cycle' };
    }
  }

  const nextVisitedForPayload = buildNextVisitedWorkflowIds(eventChainContext);

  return {
    outcome: 'scheduled',
    event: {
      ...payload,
      timestamp,
      spaceId,
      eventChainDepth: newDepth,
      eventChainVisitedWorkflowIds: nextVisitedForPayload,
    },
  };
}

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
    return createEmptyTriggerScheduleStats();
  }
  const scheduleConcurrency = pLimit(SCHEDULE_CONCURRENCY);
  const schedulePromises = workflows.map((workflow) =>
    scheduleConcurrency(
      async (): Promise<'depth_skipped' | 'skip_workflow_emit_skipped' | 'success' | 'failure'> => {
        const scheduleResult = getEventContextForScheduledWorkflow(
          workflow,
          eventParams,
          maxEventChainDepth,
          logger
        );
        if (scheduleResult.outcome === 'skipped') {
          if (scheduleResult.reason === 'skip_workflow_emit') {
            return 'skip_workflow_emit_skipped';
          }
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
            { event: scheduleResult.event },
            request,
            eventParams.triggerId,
            {
              eventDispatchTimestamp: eventParams.timestamp,
              eventTriggerId: eventParams.triggerId,
              eventId: eventParams.eventId,
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
      }
    )
  );
  const outcomes = await Promise.allSettled(schedulePromises);
  const stats = createEmptyTriggerScheduleStats();
  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.status === 'rejected') {
      const workflow = workflows[index];
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      logger.warn(
        `Event-driven workflow scheduling failed for workflow ${workflow.id} (trigger: ${eventParams.triggerId}): ${message}`
      );
      stats.scheduledAttemptCount += 1;
      stats.scheduledFailureCount += 1;
    } else {
      if (outcome.value === 'depth_skipped') {
        stats.depthSkippedCount += 1;
      } else if (outcome.value === 'skip_workflow_emit_skipped') {
        stats.skipWorkflowEmitSkippedCount += 1;
      } else {
        stats.scheduledAttemptCount += 1;
        if (outcome.value === 'success') {
          stats.scheduledSuccessCount += 1;
        } else {
          stats.scheduledFailureCount += 1;
        }
      }
    }
  }
  return stats;
}

export interface CreateTriggerEventHandlerParams {
  api: WorkflowsManagementApi;
  logger: Logger;
  telemetryClient: Pick<WorkflowsManagementTelemetryClient, 'reportTriggerEventDispatched'>;
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
  telemetryClient,
  getTriggerEventsClient,
  getWorkflowExecutionEngine,
  resolveMatchingWorkflowSubscriptions,
}: CreateTriggerEventHandlerParams): (params: TriggerEventHandlerParams) => Promise<void> {
  const reportDispatchedEvent = (event: TriggerEventDispatchedTelemetryEvent): void =>
    telemetryClient.reportTriggerEventDispatched(event);

  return async (params: TriggerEventHandlerParams): Promise<void> => {
    const engine = await getWorkflowExecutionEngine();
    const maxEventChainDepth = engine.getMaxEventChainDepth();
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
      return;
    }

    const { timestamp, triggerId, payload, request, spaceId } = params;
    let eventChainContext = params.eventChainContext;
    if (eventChainContext === undefined) {
      eventChainContext = await resolveEventChainContextFromEmitterExecution(
        api,
        request,
        spaceId,
        logger,
        maxEventChainDepth
      );
    }
    const eventId = generateUuid();

    const eventContextForResolution = {
      ...payload,
      timestamp,
      spaceId,
      eventChainDepth: 1,
    };
    const resolutionStartMs = Date.now();
    const { workflows, stats: resolutionStats } = await resolveMatchingWorkflowSubscriptions({
      triggerId,
      spaceId,
      eventContext: eventContextForResolution,
    });
    const subscriberResolutionMs = Math.max(0, Date.now() - resolutionStartMs);
    logger.trace(
      `Workflows trigger resolution funnel: triggerId=${triggerId} ${JSON.stringify(
        resolutionStats
      )}`
    );
    const subscriptions = workflows.map((w) => w.id);

    await writeTriggerEvents(
      getTriggerEventsClient(),
      logEventsEnabled,
      {
        timestamp,
        eventId,
        triggerId,
        spaceId,
        subscriptions,
        payload,
        ...(eventChainContext?.sourceExecutionId !== undefined &&
        eventChainContext.sourceExecutionId !== ''
          ? { sourceExecutionId: eventChainContext.sourceExecutionId }
          : {}),
      },
      logger
    );

    let scheduleStats = createEmptyTriggerScheduleStats();
    if (executionEnabled && workflows.length > 0) {
      scheduleStats = await scheduleMatchingWorkflows(
        api,
        workflows,
        spaceId,
        { payload, timestamp, spaceId, eventId, eventChainContext, triggerId },
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
      eventChainDepth: eventChainContext != null ? Math.max(0, eventChainContext.depth) : 0,
      eventId,
      ...(eventChainContext?.sourceExecutionId !== undefined &&
      eventChainContext.sourceExecutionId !== ''
        ? { sourceExecutionId: eventChainContext.sourceExecutionId }
        : {}),
      auditOnly: !executionEnabled && logEventsEnabled,
      subscriberResolutionMs,
      ...resolutionStats,
      ...scheduleStats,
    });
  };
}
