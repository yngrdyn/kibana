/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { CustomTriggerOnSchema } from './custom_trigger_on_schema';
import type { ConnectorEventInfo } from '../../../types/latest';

export const createConnectorEventTriggerSchema = (event: ConnectorEventInfo) =>
  z.object({
    type: event.description
      ? z.literal(event.eventId).describe(event.description)
      : z.literal(event.eventId),
    'connector-id': z.string().describe('ID of the connector instance that receives this event'),
    on: CustomTriggerOnSchema,
  });

/**
 * Returns Zod schemas for connector-event triggers (`type`, required `connector-id`, optional `on`).
 */
export const getTriggerSchemaFromConnectorEvents = (connectorEvents: ConnectorEventInfo[]) =>
  connectorEvents.map(createConnectorEventTriggerSchema);
