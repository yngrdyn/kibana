/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveConnectorEventTriggerDefinition } from '@kbn/workflows';

export const isConnectorEventTriggerId = (triggerId: string): boolean =>
  resolveConnectorEventTriggerDefinition(triggerId) !== undefined;

export const readTriggerConnectorId = (trigger: unknown): string | undefined => {
  if (trigger == null || typeof trigger !== 'object' || !('connector-id' in trigger)) {
    return undefined;
  }

  const connectorId = trigger['connector-id'];
  if (typeof connectorId !== 'string') {
    return undefined;
  }

  const trimmed = connectorId.trim();
  return trimmed === '' ? undefined : trimmed;
};

export const readEventConnectorId = (payload: Record<string, unknown>): string | undefined => {
  const connectorId = payload.connectorId;
  if (typeof connectorId !== 'string') {
    return undefined;
  }

  const trimmed = connectorId.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Whether a connector-event trigger's subscribed instance matches the emitted event payload.
 * Both YAML `connector-id` and emit payload `connectorId` must be present and equal.
 */
export const connectorEventTriggerInstanceMatches = (
  trigger: unknown,
  payload: Record<string, unknown>
): boolean => {
  const triggerConnectorId = readTriggerConnectorId(trigger);
  const eventConnectorId = readEventConnectorId(payload);

  return (
    triggerConnectorId !== undefined &&
    eventConnectorId !== undefined &&
    triggerConnectorId === eventConnectorId
  );
};
