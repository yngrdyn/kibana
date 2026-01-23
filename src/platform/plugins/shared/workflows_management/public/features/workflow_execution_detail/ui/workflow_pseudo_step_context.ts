/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type { WorkflowExecutionDto, WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';

export type TriggerType = 'alert' | 'scheduled' | 'manual' | string;

export interface TriggerContextFromExecution {
  triggerType: TriggerType;
  input: JsonValue;
}

export function buildTriggerContextFromExecution(
  executionContext: Record<string, unknown> | undefined | null
): TriggerContextFromExecution | null {
  if (!executionContext) {
    return null;
  }

  // First, check if triggeredBy is explicitly set in the context
  // This is set from the execution's triggeredBy field for event-driven triggers
  const triggeredBy = executionContext.triggeredBy as string | undefined;
  
  let triggerType: TriggerType = 'manual'; // Default to manual trigger type

  if (triggeredBy) {
    // Use the explicit triggeredBy value (supports event-driven triggers like 'event.example', 'workflow.execution_failed', etc.)
    triggerType = triggeredBy;
  } else {
    // Fall back to inference from event structure for backward compatibility
    const hasEvent = executionContext.event !== undefined;
    const isScheduled =
      (executionContext.event as { type?: string } | undefined)?.type === 'scheduled';

    if (isScheduled) {
      triggerType = 'scheduled';
    } else if (hasEvent) {
      triggerType = 'alert';
    }
  }

  const inputData = (executionContext as { event?: JsonValue; inputs?: JsonValue }).event
    ? executionContext.event
    : executionContext.inputs;

  return {
    triggerType,
    input: inputData as JsonValue,
  };
}

export function buildTriggerStepExecutionFromContext(
  workflowExecution: WorkflowExecutionDto
): WorkflowStepExecutionDto | null {
  // Merge execution's triggeredBy into context if it exists and context doesn't have it
  const context = workflowExecution.context as Record<string, unknown> | undefined | null;
  const enrichedContext = context
    ? {
        ...context,
        // Use execution's triggeredBy if context doesn't have it
        triggeredBy: context.triggeredBy ?? workflowExecution.triggeredBy,
      }
    : workflowExecution.triggeredBy
    ? { triggeredBy: workflowExecution.triggeredBy }
    : null;

  const triggerContext = buildTriggerContextFromExecution(enrichedContext);

  if (!triggerContext) {
    return null;
  }

  return {
    id: 'trigger',
    stepId: triggerContext.triggerType,
    stepType: `trigger_${triggerContext.triggerType}`,
    status: ExecutionStatus.COMPLETED,
    input: triggerContext.input,
    output: undefined,
    scopeStack: [],
    workflowRunId: workflowExecution.id,
    workflowId: workflowExecution.workflowId || '',
    startedAt: '',
    globalExecutionIndex: -1,
    stepExecutionIndex: 0,
    topologicalIndex: -1,
  } as WorkflowStepExecutionDto;
}

export function buildOverviewStepExecutionFromContext(
  workflowExecution: WorkflowExecutionDto
): WorkflowStepExecutionDto {
  let contextData: JsonValue | undefined;
  if (workflowExecution.context) {
    const { inputs, event, ...context } = workflowExecution.context;
    contextData = context as JsonValue;
  }

  return {
    id: '__overview',
    stepId: 'Overview',
    stepType: '__overview',
    status: workflowExecution.status,
    stepExecutionIndex: 0,
    startedAt: workflowExecution.startedAt,
    input: contextData,
    scopeStack: [],
    workflowRunId: workflowExecution.id,
    workflowId: workflowExecution.workflowId ?? '',
    topologicalIndex: -1,
    globalExecutionIndex: -1,
  };
}
