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
 * Trigger type ID for the event.example trigger.
 */
export const ExampleTriggerId = 'event.example';

/**
 * Event schema for the event.example trigger.
 */
export const EventSchema = z.object({
  workflowId: z.string(),
  message: z.string(),
  type: z.string(),
});

export type ExampleEventSchema = typeof EventSchema;

/**
 * Common trigger definition for event.example trigger.
 * This is shared between server and public implementations.
 */
export const exampleTriggerCommonDefinition: CommonTriggerDefinition<ExampleEventSchema> = {
  id: ExampleTriggerId,
  description: 'Example event trigger for testing',
  eventSchema: EventSchema,
};
