/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';

/**
 * Definition of a workflow trigger.
 * Contains the trigger identifier, description, and event schema.
 *
 * @example
 * ```typescript
 * const myTriggerDefinition: TriggerDefinition = {
 *   id: 'custom.myTrigger',
 *   description: 'Emitted when a custom event occurs',
 *   eventSchema: z.object({
 *     eventId: z.string(),
 *     timestamp: z.string(),
 *   }),
 * };
 * ```
 */
export interface TriggerDefinition {
  /**
   * Unique identifier for the trigger (e.g., 'workflow.error', 'alert.fired')
   */
  id: string;

  /**
   * Human-readable description of when this trigger is emitted
   */
  description: string;

  /**
   * Zod schema defining the structure of the event payload
   */
  eventSchema: z.ZodType;
}
