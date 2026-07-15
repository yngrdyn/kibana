/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { getConnectorSpec, normalizeConnectorTypeId } from '@kbn/connector-specs';

import type { ActionsConfig } from '../config';
import type { ActionTypeRegistry, ConnectorEventEmitParams, InMemoryConnector } from '../types';
import { loadInboundConnector } from './load_inbound_connector';
import { extractIngestToken, verifyIngestToken } from './verify_ingress_auth';

export interface HandleInboundRequestParams {
  request: import('@kbn/core/server').KibanaRequest;
  response: import('@kbn/core/server').KibanaResponseFactory;
  typeId: string;
  connectorId: string;
  inboundConnectorsConfig: ActionsConfig['inboundConnectors'];
  emitConnectorEvents: (params: ConnectorEventEmitParams) => Promise<void>;
  logger: Logger;
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  inMemoryConnectors: InMemoryConnector[];
  actionTypeRegistry: ActionTypeRegistry;
  isESOCanEncrypt: boolean;
  getSpaceId: (request: import('@kbn/core/server').KibanaRequest) => string;
}

export async function handleInboundRequest({
  request,
  response,
  typeId,
  connectorId,
  inboundConnectorsConfig,
  emitConnectorEvents,
  logger,
  encryptedSavedObjectsClient,
  unsecuredSavedObjectsClient,
  inMemoryConnectors,
  actionTypeRegistry,
  isESOCanEncrypt,
  getSpaceId,
}: HandleInboundRequestParams) {
  if (!inboundConnectorsConfig.enabled) {
    return response.forbidden({ body: 'Inbound connector events are disabled' });
  }

  const connectorTypeId = normalizeConnectorTypeId(typeId);
  const spec = getConnectorSpec(connectorTypeId);
  if (!spec?.events) {
    return response.notFound();
  }

  const spaceId = getSpaceId(request);
  const connector = await loadInboundConnector({
    connectorId,
    connectorTypeId,
    spaceId,
    encryptedSavedObjectsClient,
    unsecuredSavedObjectsClient,
    inMemoryConnectors,
    actionTypeRegistry,
    isESOCanEncrypt,
    logger,
  });
  if (!connector) {
    return response.notFound();
  }

  const ingestTokenHash =
    typeof connector.config.ingestTokenHash === 'string'
      ? connector.config.ingestTokenHash
      : undefined;
  if (typeof ingestTokenHash !== 'string' || ingestTokenHash.length === 0) {
    return response.notFound();
  }

  const providedToken = extractIngestToken({
    query: request.query as Record<string, unknown>,
    headers: request.headers,
  });
  if (
    !providedToken ||
    !verifyIngestToken({
      connectorId,
      spaceId,
      providedToken,
      ingestTokenHash,
    })
  ) {
    return response.notFound();
  }

  const headersForHandler = {
    ...request.headers,
    'x-inbound-query': JSON.stringify(request.query ?? {}),
  };

  const result = await spec.events.handleEvents({
    connectorId,
    connectorTypeId,
    spaceId,
    config: connector.config,
    secrets: connector.secrets,
    rawBody: request.body,
    headers: headersForHandler,
    log: logger,
  });

  if (result.httpResponse) {
    const { status, body, headers } = result.httpResponse;
    return response.custom({
      statusCode: status,
      body: body as Parameters<typeof response.custom>[0]['body'],
      headers,
    });
  }

  for (const event of result.events ?? []) {
    await emitConnectorEvents({
      eventId: event.eventId,
      payload: {
        ...event.payload,
        connectorId,
        connectorTypeId,
        correlationKey: event.correlationKey,
      },
      spaceId,
      connectorId,
      connectorTypeId,
    });
  }

  return response.accepted({ body: { ok: true } });
}
