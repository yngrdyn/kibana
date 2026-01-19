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
 * Common trigger definition fields shared between server and public.
 * Event schema is used for validation and type inference.
 */
export interface CommonTriggerDefinition<EventSchema extends z.ZodType = z.ZodType> {
  /**
   * Unique identifier for this trigger type.
   * Should follow a namespaced format (e.g., "workflow.error", "alert.fired").
   */
  id: string;

  /**
   * Human-readable description of when this trigger is emitted.
   */
  description: string;

  /**
   * Zod schema defining the structure of the event payload.
   * Used for validation and type inference.
   */
  eventSchema: EventSchema;
}
