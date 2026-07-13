/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { AlertRuleTriggerSchema } from './alert_trigger_schema';
import { getTriggerSchemaFromConnectorEvents } from './connector_event_trigger_schema';
import { CustomTriggerOnSchema } from './custom_trigger_on_schema';
import { ManualTriggerSchema } from './manual_trigger_schema';
import { ScheduledTriggerSchema } from './scheduled_trigger_schema';
import type { ConnectorEventInfo } from '../../../types/latest';

export { AlertRuleTriggerSchema } from './alert_trigger_schema';
export { ManualTriggerSchema } from './manual_trigger_schema';
export {
  ScheduledTriggerSchema,
  SCHEDULED_INTERVAL_ERROR,
  SCHEDULED_INTERVAL_PATTERN,
} from './scheduled_trigger_schema';
export {
  WORKFLOW_EVENTS_VALUES_SET,
  WorkflowEventsSchema,
  type WorkflowEventsValue,
} from './workflow_events_schema';
export { CustomTriggerOnSchema } from './custom_trigger_on_schema';
export {
  createConnectorEventTriggerSchema,
  getTriggerSchemaFromConnectorEvents,
} from './connector_event_trigger_schema';
export { collectConnectorEventsFromTypes } from './collect_connector_events_from_types';
export {
  collectConnectorEventsForTriggerSchema,
  type RegisteredTriggerForSchema,
  type RegisteredTriggerSchemaArg,
} from './collect_connector_events_for_trigger_schema';

export const TriggerSchema = z.discriminatedUnion('type', [
  AlertRuleTriggerSchema,
  ScheduledTriggerSchema,
  ManualTriggerSchema,
]);

export type Trigger = z.infer<typeof TriggerSchema>;

/**
 * Returns a trigger schema that includes built-in types plus optional registered trigger ids
 * and connector-event triggers discovered from `GET /api/workflows/connectors`.
 * Used by the YAML editor so custom trigger types (e.g. example.custom_trigger) pass validation.
 * Custom triggers allow an `on.condition` clause for KQL filtering.
 * Connector-event triggers require `connector-id` and allow the same optional `on` block.
 */
export function getTriggerSchema(
  customTriggerIds: string[] = [],
  connectorEvents: ConnectorEventInfo[] = []
): z.ZodType {
  const connectorEventIds = new Set(connectorEvents.map((event) => event.eventId));
  const plainCustomTriggerIds = customTriggerIds.filter((id) => !connectorEventIds.has(id));

  if (plainCustomTriggerIds.length === 0 && connectorEvents.length === 0) {
    return TriggerSchema;
  }

  const plainCustomSchemas = plainCustomTriggerIds.map((id) =>
    z.object({
      type: z.literal(id),
      on: CustomTriggerOnSchema,
    })
  );

  return z.discriminatedUnion('type', [
    AlertRuleTriggerSchema,
    ScheduledTriggerSchema,
    ManualTriggerSchema,
    ...plainCustomSchemas,
    ...getTriggerSchemaFromConnectorEvents(connectorEvents),
  ]);
}

export const TriggerTypes = [
  AlertRuleTriggerSchema.shape.type.value,
  ScheduledTriggerSchema.shape.type.value,
  ManualTriggerSchema.shape.type.value,
];
export type TriggerType = (typeof TriggerTypes)[number];
