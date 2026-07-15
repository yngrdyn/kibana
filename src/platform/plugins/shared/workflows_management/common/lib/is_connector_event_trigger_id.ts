/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getCachedDynamicConnectorTypes } from '../schema';

/**
 * Returns whether the given id is a connector-event trigger from the cached
 * `/api/workflows/connectors` response (e.g. `inboundWebhook.received`).
 */
export const isConnectorEventTriggerId = (triggerId: string): boolean => {
  const connectorTypes = getCachedDynamicConnectorTypes();
  if (!connectorTypes) {
    return false;
  }

  for (const connectorType of Object.values(connectorTypes)) {
    if (connectorType.events?.some((event) => event.eventId === triggerId)) {
      return true;
    }
  }

  return false;
};
