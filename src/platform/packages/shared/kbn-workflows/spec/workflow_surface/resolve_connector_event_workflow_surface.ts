/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveRegisteredConnectorEventByEventId } from '@kbn/connector-specs';
import { connectorEventToWorkflowSurface } from './connector_event_to_workflow_surface';
import type { WorkflowSurfaceDefinition } from './types';

/** Resolves a connector-event trigger id to its workflow surface (from ConnectorSpec.events). */
export const resolveConnectorEventWorkflowSurface = (
  eventId: string
): WorkflowSurfaceDefinition | undefined => {
  const event = resolveRegisteredConnectorEventByEventId(eventId);
  if (!event) {
    return undefined;
  }

  return connectorEventToWorkflowSurface(event);
};
