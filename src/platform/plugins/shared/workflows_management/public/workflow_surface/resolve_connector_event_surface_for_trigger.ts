/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveRegisteredConnectorEventByEventId } from '@kbn/connector-specs';
import type { ConnectorTypeInfo, WorkflowSurfaceDefinition } from '@kbn/workflows';
import {
  connectorEventToWorkflowSurface,
  resolveConnectorEventWorkflowSurface,
} from '@kbn/workflows';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';

export const inferConnectorTypeIdFromEventId = (eventId: string): string | undefined => {
  const dotIndex = eventId.indexOf('.');
  if (dotIndex <= 0) {
    return undefined;
  }
  return `.${eventId.slice(0, dotIndex)}`;
};

export const findConnectorTypeIdForEventTrigger = (
  triggerId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>
): string | undefined => {
  for (const connectorType of Object.values(connectorTypes)) {
    if (connectorType.events?.some((event) => event.eventId === triggerId)) {
      return connectorType.actionTypeId;
    }
  }

  return inferConnectorTypeIdFromEventId(triggerId);
};

/**
 * Resolves a connector-event workflow surface for a trigger id using ConnectorSpec,
 * dynamic connector types from the API, or extension trigger metadata.
 */
export const resolveConnectorEventSurfaceForTriggerId = (
  triggerId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>,
  extensionTrigger?: PublicTriggerDefinition
): WorkflowSurfaceDefinition | undefined => {
  const fromRegisteredSpec = resolveConnectorEventWorkflowSurface(triggerId);
  if (fromRegisteredSpec) {
    return fromRegisteredSpec;
  }

  const registeredEvent = resolveRegisteredConnectorEventByEventId(triggerId);
  if (registeredEvent) {
    return connectorEventToWorkflowSurface(registeredEvent);
  }

  const connectorTypeId = findConnectorTypeIdForEventTrigger(triggerId, connectorTypes);
  const requiresConnectorId = extensionTrigger?.requiresConnectorId === true;
  if (!connectorTypeId || !requiresConnectorId) {
    return undefined;
  }

  const eventKeyDotIndex = triggerId.indexOf('.');
  const eventKey = eventKeyDotIndex === -1 ? triggerId : triggerId.slice(eventKeyDotIndex + 1);

  return {
    id: triggerId,
    kind: 'trigger',
    title: extensionTrigger.title,
    description: extensionTrigger.description,
    stability: extensionTrigger.stability,
    binding: {
      connectorTypeId,
      instanceRef: 'required',
    },
    surfaces: {},
    source: {
      type: 'connector-event',
      connectorTypeId,
      eventKey,
    },
  };
};
