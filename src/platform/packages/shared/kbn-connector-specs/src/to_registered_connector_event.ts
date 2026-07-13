/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorMetadata } from './connector_spec';
import type { ConnectorEventDefinition, RegisteredConnectorEvent } from './connector_spec_events';
import { buildConnectorEventId } from './connector_event_type_id';

export const toRegisteredConnectorEvent = (
  metadata: ConnectorMetadata,
  eventKey: string,
  def: ConnectorEventDefinition
): RegisteredConnectorEvent => {
  const expectedEventId = buildConnectorEventId(metadata.id, eventKey);
  if (def.eventId !== expectedEventId) {
    throw new Error(
      `Connector event eventId mismatch for ${metadata.id}.${eventKey}: expected "${expectedEventId}", got "${def.eventId}"`
    );
  }

  return {
    ...def,
    connectorTypeId: metadata.id,
    eventKey,
  };
};
