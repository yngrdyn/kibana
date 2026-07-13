/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RegisteredConnectorEvent } from '@kbn/connector-specs';
import type { WorkflowSurfaceDefinition } from './types';

export const connectorEventToWorkflowSurface = (
  event: RegisteredConnectorEvent
): WorkflowSurfaceDefinition => ({
  id: event.eventId,
  kind: 'trigger',
  title: event.title,
  description: event.description,
  stability: event.stability ?? 'tech_preview',
  binding: {
    connectorTypeId: event.connectorTypeId,
    instanceRef: 'required',
  },
  surfaces: {
    input: event.eventSchema,
    filter: {
      schema: event.eventSchema,
      language: 'kql',
      yamlPath: 'on.condition',
    },
  },
  source: {
    type: 'connector-event',
    connectorTypeId: event.connectorTypeId,
    eventKey: event.eventKey,
  },
});
