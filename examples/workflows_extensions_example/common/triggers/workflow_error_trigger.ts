/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';

/**
 * Trigger type ID for the workflow.error trigger.
 */
export const WorkflowErrorTriggerId = 'workflow.error';

/**
 * Event schema for the workflow.error trigger.
 */
export const EventSchema = z.object({
  workflowId: z.string(),
  executionId: z.string(),
  error: z.string(),
});

export type WorkflowErrorEventSchema = typeof EventSchema;

/**
 * Common trigger definition for workflow.error trigger.
 * This is shared between server and public implementations.
 */
export const workflowErrorTriggerCommonDefinition: CommonTriggerDefinition<WorkflowErrorEventSchema> = {
  id: WorkflowErrorTriggerId,
  description: 'Emitted when a workflow execution fails',
  eventSchema: EventSchema,
};
