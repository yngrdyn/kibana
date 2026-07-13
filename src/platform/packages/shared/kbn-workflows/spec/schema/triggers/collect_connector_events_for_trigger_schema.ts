/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveRegisteredConnectorEventByEventId } from '@kbn/connector-specs';
import { collectConnectorEventsFromTypes } from './collect_connector_events_from_types';
import type { ConnectorEventInfo, ConnectorTypeInfo, StabilityLevel } from '../../../types/latest';

export interface RegisteredTriggerForSchema {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly stability?: StabilityLevel;
  readonly requiresConnectorId?: boolean;
}

export type RegisteredTriggerSchemaArg = string | RegisteredTriggerForSchema;

const toRegisteredTriggerForSchema = (
  trigger: RegisteredTriggerSchemaArg
): RegisteredTriggerForSchema =>
  typeof trigger === 'string'
    ? {
        id: trigger,
        title: trigger,
        description: '',
      }
    : trigger;

const eventKeyFromTriggerId = (triggerId: string): string => {
  const separatorIndex = triggerId.lastIndexOf('.');
  return separatorIndex === -1 ? triggerId : triggerId.slice(separatorIndex + 1);
};

/**
 * Builds trigger schema input by merging connector events from connector types,
 * registered connector specs, and extension triggers that require connector binding.
 */
export const collectConnectorEventsForTriggerSchema = (
  connectorTypes: Record<string, ConnectorTypeInfo>,
  registeredTriggers: RegisteredTriggerSchemaArg[] = []
): { customTriggerIds: string[]; connectorEvents: ConnectorEventInfo[] } => {
  const normalizedTriggers = registeredTriggers.map(toRegisteredTriggerForSchema);
  const connectorEvents = [...collectConnectorEventsFromTypes(connectorTypes)];
  const connectorEventIds = new Set(connectorEvents.map((event) => event.eventId));

  for (const trigger of normalizedTriggers) {
    if (!connectorEventIds.has(trigger.id)) {
      const fromSpec = resolveRegisteredConnectorEventByEventId(trigger.id);
      if (fromSpec) {
        connectorEvents.push({
          eventKey: fromSpec.eventKey,
          eventId: fromSpec.eventId,
          title: fromSpec.title,
          description: fromSpec.description,
          stability: fromSpec.stability,
        });
        connectorEventIds.add(fromSpec.eventId);
      } else if (trigger.requiresConnectorId) {
        connectorEvents.push({
          eventKey: eventKeyFromTriggerId(trigger.id),
          eventId: trigger.id,
          title: trigger.title,
          description: trigger.description,
          stability: trigger.stability,
        });
        connectorEventIds.add(trigger.id);
      }
    }
  }

  return {
    customTriggerIds: normalizedTriggers.map((trigger) => trigger.id),
    connectorEvents,
  };
};
