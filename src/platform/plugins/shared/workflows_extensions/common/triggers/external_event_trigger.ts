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
 * Trigger type ID for the external.event trigger.
 */
export const ExternalEventTriggerId = 'external.event';

/**
 * Event schema for the external.event trigger.
 * Generic trigger for external system events (e.g., Slack, GitHub, Jira).
 * The payload structure allows for flexible event types from different sources.
 */
export const ExternalEventEventSchema = z.object({
  /**
   * The external system that generated the event (e.g., "slack", "github", "jira").
   */
  source: z.string(),
  /**
   * The semantic type of the event within the external system (e.g., "message.posted", "issue.created").
   */
  type: z.string(),
  /**
   * The raw normalized data from the external system.
   * This is a flexible object that can contain any structure specific to the event type.
   */
  payload: z.record(z.string(), z.any()),
});

export type ExternalEventEventSchema = typeof ExternalEventEventSchema;

/**
 * Common trigger definition for external.event trigger.
 * This is shared between server and public implementations.
 */
export const externalEventTriggerDefinition: CommonTriggerDefinition<ExternalEventEventSchema> = {
  id: ExternalEventTriggerId,
  description: 'Generic external event from external systems (e.g., Slack, GitHub, Jira)',
  eventSchema: ExternalEventEventSchema,
};
