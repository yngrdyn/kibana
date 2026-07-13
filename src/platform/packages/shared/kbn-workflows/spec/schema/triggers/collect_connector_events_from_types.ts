/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorEventInfo, ConnectorTypeInfo } from '../../../types/latest';

/** Collects all connector events declared on connector types from `GET /api/workflows/connectors`. */
export const collectConnectorEventsFromTypes = (
  connectorTypes: Record<string, ConnectorTypeInfo>
): ConnectorEventInfo[] => {
  const events: ConnectorEventInfo[] = [];

  for (const connectorType of Object.values(connectorTypes)) {
    if (connectorType.events?.length) {
      events.push(...connectorType.events);
    }
  }

  return events;
};
