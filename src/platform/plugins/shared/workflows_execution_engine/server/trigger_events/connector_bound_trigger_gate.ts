/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

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
 * Whether a connector-bound trigger's subscribed instance matches the emitted event payload.
 * Triggers without `connector-id` are not connector-bound and always match.
 */
export const connectorBoundTriggerInstanceMatches = (
  trigger: unknown,
  payload: Record<string, unknown>
): boolean => {
  const triggerConnectorId = readTriggerConnectorId(trigger);
  if (triggerConnectorId === undefined) {
    return true;
  }

  const eventConnectorId = readEventConnectorId(payload);
  return (
    eventConnectorId !== undefined && triggerConnectorId === eventConnectorId
  );
};
