/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Connector eventId namespace and public hub URL segment — strips leading dot.
 * `.inboundWebhook` → `inboundWebhook`
 */
export const connectorTypeToEventNamespace = (connectorTypeId: string): string =>
  connectorTypeId.replace(/^\./, '');

/**
 * Hub route: URL `{typeId}` → canonical actionTypeId for connector SO lookup.
 * `inboundWebhook` → `.inboundWebhook`
 */
export const normalizeConnectorTypeId = (typeId: string): string =>
  typeId.startsWith('.') ? typeId : `.${typeId}`;

export const buildConnectorEventId = (connectorTypeId: string, eventKey: string): string =>
  `${connectorTypeToEventNamespace(connectorTypeId)}.${eventKey}`;

export const buildConnectorIngressEventsPath = ({
  connectorTypeId,
  connectorId,
}: {
  connectorTypeId: string;
  connectorId: string;
}): string => `/api/events/v1/${connectorTypeToEventNamespace(connectorTypeId)}/${connectorId}`;
