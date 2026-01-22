/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '../trigger_registry/types';

/**
 * Trigger type ID for the workflow.execution_failed trigger.
 */
export const WorkflowExecutionFailedTriggerId = 'workflow.execution_failed';

/**
 * Event schema for the workflow.execution_failed trigger.
 * Emitted when a workflow execution fails.
 */
export const WorkflowExecutionFailedEventSchema = z.object({
  workflow: z.object({
    id: z.string(),
    name: z.string(),
    spaceId: z.string(),
    isErrorHandler: z.boolean(),
  }),
  execution: z.object({
    id: z.string(),
    startedAt: z.string(), // ISO timestamp
    failedAt: z.string(), // ISO timestamp
  }),
  error: z.object({
    message: z.string(),
    stepId: z.string(),
    stepName: z.string(),
    stackTrace: z.string().optional(),
  }),
});

export type WorkflowExecutionFailedEventSchema = typeof WorkflowExecutionFailedEventSchema;

/**
 * Common trigger definition for workflow.execution_failed trigger.
 * This is shared between server and public implementations.
 */
export const workflowExecutionFailedTriggerDefinition: CommonTriggerDefinition<WorkflowExecutionFailedEventSchema> =
  {
    id: WorkflowExecutionFailedTriggerId,
    description: 'Emitted when a workflow execution fails',
    eventSchema: WorkflowExecutionFailedEventSchema,
  };
