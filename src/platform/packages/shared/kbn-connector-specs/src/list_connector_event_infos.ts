/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorSpec } from './connector_spec';
import type { ConnectorEventStability } from './connector_spec_events';
import { getConnectorSpec } from './get_connector_spec';

export interface ConnectorEventInfo {
  readonly eventKey: string;
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly stability?: ConnectorEventStability;
}

export const listConnectorEventInfos = (spec: ConnectorSpec): ConnectorEventInfo[] => {
  const definitions = spec.events?.definitions;
  if (!definitions) {
    return [];
  }

  return Object.entries(definitions).map(([eventKey, definition]) => ({
    eventKey,
    eventId: definition.eventId,
    title: definition.title,
    description: definition.description,
    stability: definition.stability,
  }));
};

export const listConnectorEventInfosForType = (connectorTypeId: string): ConnectorEventInfo[] => {
  const spec = getConnectorSpec(connectorTypeId);
  if (!spec) {
    return [];
  }

  return listConnectorEventInfos(spec);
};
