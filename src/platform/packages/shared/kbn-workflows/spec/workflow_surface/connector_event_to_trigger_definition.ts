/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RegisteredConnectorEvent } from '@kbn/connector-specs';
import type { z } from '@kbn/zod/v4';
import type { StabilityLevel } from '../../types/v1';

export interface ConnectorEventTriggerDefinition<EventSchema extends z.ZodType = z.ZodType> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly stability: StabilityLevel;
  readonly eventSchema: EventSchema;
}

export const connectorEventToTriggerDefinition = (
  event: RegisteredConnectorEvent
): ConnectorEventTriggerDefinition => ({
  id: event.eventId,
  title: event.title,
  description: event.description,
  stability: event.stability ?? 'tech_preview',
  eventSchema: event.eventSchema,
});
