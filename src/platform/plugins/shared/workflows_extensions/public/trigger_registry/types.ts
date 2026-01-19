/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", or the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';

/**
 * Client-side representation of a trigger definition.
 * Note: eventSchema is optional because Zod schemas cannot be serialized over HTTP.
 * The client creates a placeholder schema for schema generation purposes.
 */
export interface TriggerDefinition {
  /**
   * Unique identifier for this trigger type.
   */
  id: string;

  /**
   * Human-readable description of when this trigger is emitted.
   */
  description: string;

  /**
   * Zod schema defining the structure of the event payload.
   * Optional because it cannot be serialized over HTTP.
   * The client will create a placeholder schema for schema generation.
   */
  eventSchema?: z.ZodType;
}
