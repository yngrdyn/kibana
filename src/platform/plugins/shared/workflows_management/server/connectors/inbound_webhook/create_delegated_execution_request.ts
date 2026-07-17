/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { InboundWebhookApiKeyService } from '../../services/inbound_webhook_api_key_service';
import type { InboundWebhookMappingRepository } from '../../storage/inbound_webhook_mapping_repository';

export interface CreateDelegatedExecutionRequestDependencies {
  getApiKeyService: () => InboundWebhookApiKeyService;
  getMappingRepository: () => InboundWebhookMappingRepository;
  namespaceToSpaceId: (namespace: string | undefined) => string;
}

export interface CreateDelegatedExecutionRequestArgs {
  connectorId: string;
  credentialRevision: string;
  savedObjectsClient: SavedObjectsClientContract;
}

/**
 * Rebuilds the delegated user-scoped request for connector execution when Actions
 * does not pass `request` (user-created connectors) and the ingress route did
 * not stage one in {@link InboundWebhookRequestStore}.
 */
export const createDelegatedInboundWebhookExecutionRequest = async (
  dependencies: CreateDelegatedExecutionRequestDependencies,
  {
    connectorId,
    credentialRevision,
    savedObjectsClient,
  }: CreateDelegatedExecutionRequestArgs
): Promise<KibanaRequest | undefined> => {
  const spaceId = dependencies.namespaceToSpaceId(savedObjectsClient.getCurrentNamespace());
  const mappings = await dependencies
    .getMappingRepository()
    .getForConnector(connectorId, spaceId);
  const activeMapping = mappings.find(
    ({ attributes }) =>
      attributes.payload.status === 'active' &&
      attributes.payload.credentialRevision === credentialRevision
  );

  if (!activeMapping) {
    return undefined;
  }

  const authorization = dependencies
    .getApiKeyService()
    .getAuthorizationHeader(activeMapping.attributes.payload.secrets);

  return kibanaRequestFactory({
    headers: { authorization },
    spaceId: asSpaceId(spaceId),
  });
};
