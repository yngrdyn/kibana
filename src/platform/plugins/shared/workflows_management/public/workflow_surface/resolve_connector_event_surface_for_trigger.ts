/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ConnectorEventInfo,
  ConnectorTypeInfo,
  WorkflowSurfaceDefinition,
} from '@kbn/workflows';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';

export const inferConnectorTypeIdFromEventId = (eventId: string): string | undefined => {
  const dotIndex = eventId.indexOf('.');
  if (dotIndex <= 0) {
    return undefined;
  }
  return `.${eventId.slice(0, dotIndex)}`;
};

export const findConnectorEventForTrigger = (
  triggerId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>
): { event: ConnectorEventInfo; connectorTypeId: string } | undefined => {
  for (const connectorType of Object.values(connectorTypes)) {
    const event = connectorType.events?.find((candidate) => candidate.eventId === triggerId);
    if (event) {
      return { event, connectorTypeId: connectorType.actionTypeId };
    }
  }

  return undefined;
};

export const findConnectorTypeIdForEventTrigger = (
  triggerId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>
): string | undefined => {
  return (
    findConnectorEventForTrigger(triggerId, connectorTypes)?.connectorTypeId ??
    inferConnectorTypeIdFromEventId(triggerId)
  );
};

const connectorEventInfoToWorkflowSurface = ({
  event,
  connectorTypeId,
  extensionTrigger,
}: {
  event: ConnectorEventInfo;
  connectorTypeId: string;
  extensionTrigger?: PublicTriggerDefinition;
}): WorkflowSurfaceDefinition => {
  const eventSchema = extensionTrigger?.eventSchema;

  return {
    id: event.eventId,
    kind: 'trigger',
    title: event.title,
    description: event.description,
    stability: event.stability ?? extensionTrigger?.stability ?? 'tech_preview',
    binding: {
      connectorTypeId,
      instanceRef: 'required',
    },
    surfaces: eventSchema
      ? {
          input: eventSchema,
          filter: {
            schema: eventSchema,
            language: 'kql',
            yamlPath: 'on.condition',
          },
        }
      : {},
    source: {
      type: 'connector-event',
      connectorTypeId,
      eventKey: event.eventKey,
    },
  };
};

/**
 * Resolves a connector-event workflow surface for a trigger id using connector types
 * from the API and extension trigger metadata (never ConnectorSpec in the browser).
 */
export const resolveConnectorEventSurfaceForTriggerId = (
  triggerId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>,
  extensionTrigger?: PublicTriggerDefinition
): WorkflowSurfaceDefinition | undefined => {
  const connectorEvent = findConnectorEventForTrigger(triggerId, connectorTypes);
  if (connectorEvent) {
    return connectorEventInfoToWorkflowSurface({
      ...connectorEvent,
      extensionTrigger,
    });
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
    surfaces: extensionTrigger.eventSchema
      ? {
          input: extensionTrigger.eventSchema,
          filter: {
            schema: extensionTrigger.eventSchema,
            language: 'kql',
            yamlPath: 'on.condition',
          },
        }
      : {},
    source: {
      type: 'connector-event',
      connectorTypeId,
      eventKey,
    },
  };
};
