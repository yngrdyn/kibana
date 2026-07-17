/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Boom from '@hapi/boom';
import { createHash } from 'crypto';
import { WorkflowsConnectorFeatureId } from '@kbn/actions-plugin/common';
import type {
  ActionType,
  ActionTypeExecutorOptions,
  ActionTypeExecutorResult,
} from '@kbn/actions-plugin/server/types';
import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  type CreateDelegatedExecutionRequestDependencies,
  createDelegatedInboundWebhookExecutionRequest,
} from './create_delegated_execution_request';
import {
  InboundWebhookConfigSchema,
  InboundWebhookParamsSchema,
  InboundWebhookSecretsSchema,
} from './schema';
import type {
  InboundWebhookConfig,
  InboundWebhookEvent,
  InboundWebhookParams,
  InboundWebhookResult,
  InboundWebhookSecrets,
} from './types';
import { INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID } from '../../../common/inbound_webhook/constants';
import type {
  DelegatedWebhookCredentials,
  InboundWebhookApiKeyService,
} from '../../services/inbound_webhook_api_key_service';
import type { InboundWebhookMappingRepository } from '../../storage/inbound_webhook_mapping_repository';

export const INBOUND_WEBHOOK_CONNECTOR_TYPE_ID = '.workflows-inbound-webhook' as const;

export interface InboundWebhookConnectorDependencies
  extends CreateDelegatedExecutionRequestDependencies {
  canEncrypt: () => boolean;
  emitEvent: (
    request: KibanaRequest,
    triggerId: string,
    event: InboundWebhookEvent
  ) => Promise<void>;
  getApiKeyService: () => InboundWebhookApiKeyService;
  getMappingRepository: () => InboundWebhookMappingRepository;
  takeRequest: (eventId: string) => KibanaRequest | undefined;
  getSavedObjectsClient: (request: KibanaRequest) => Promise<SavedObjectsClientContract>;
  getSpaceId: (request: KibanaRequest) => string;
}

const hashWebhookKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const getWebhookKey = (webhookUrl: string): string => {
  const url = new URL(webhookUrl);
  const key = url.pathname.split('/').filter(Boolean).at(-1);
  if (!key) {
    throw new Error('Webhook URL must contain a key');
  }
  return key;
};

const getPendingId = (connectorId: string, credentialRevision: string): string =>
  `pending:${connectorId}:${credentialRevision}`;

export const getInboundWebhookConnectorType = (
  dependencies: InboundWebhookConnectorDependencies
): ActionType<
  InboundWebhookConfig,
  InboundWebhookSecrets,
  InboundWebhookParams,
  InboundWebhookResult
> => ({
  id: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
  name: i18n.translate('workflowsManagement.inboundWebhook.connectorName', {
    defaultMessage: 'Inbound Webhook',
  }),
  minimumLicenseRequired: 'gold',
  supportedFeatureIds: [WorkflowsConnectorFeatureId],
  validate: {
    config: { schema: InboundWebhookConfigSchema },
    secrets: { schema: InboundWebhookSecretsSchema },
    params: { schema: InboundWebhookParamsSchema },
  },
  preSaveHook: async ({ connectorId, config, request }) => {
    if (!dependencies.canEncrypt()) {
      throw new Error('Encrypted saved objects encryption key is not configured');
    }
    const calculatedHash = hashWebhookKey(getWebhookKey(config.webhookUrl));
    if (calculatedHash !== config.webhookKeyHash) {
      throw new Error('Webhook URL does not match webhook key hash');
    }

    const spaceId = dependencies.getSpaceId(request);
    const repository = dependencies.getMappingRepository();
    const previous = await repository.resolve(config.webhookKeyHash, spaceId);
    let credentials: DelegatedWebhookCredentials;
    try {
      credentials = await dependencies.getApiKeyService().grant(request, connectorId);
    } catch (error) {
      throw Boom.badRequest(
        `Failed to grant inbound webhook credentials: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    const credentialVersion = (previous?.attributes.payload.secrets.credentialVersion ?? 0) + 1;
    try {
      await repository.stage(
        {
          connectorId,
          credentialRevision: config.credentialRevision,
          webhookKeyHash: config.webhookKeyHash,
          spaceId,
          attributes: {
            ...credentials,
            secrets: {
              ...credentials.secrets,
              credentialVersion,
            },
          },
        },
        await dependencies.getSavedObjectsClient(request)
      );
    } catch (error) {
      await dependencies.getApiKeyService().invalidate({
        ...credentials,
        connectorId,
        connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
        status: 'pending',
        targetWebhookKeyHash: config.webhookKeyHash,
        credentialRevision: config.credentialRevision,
        createdAt: new Date().toISOString(),
        secrets: {
          ...credentials.secrets,
          credentialVersion,
        },
        updatedAt: new Date().toISOString(),
      });
      throw Boom.badRequest(
        `Failed to stage inbound webhook credentials: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
  postSaveHook: async ({ connectorId, config, request, wasSuccessful }) => {
    const spaceId = dependencies.getSpaceId(request);
    const repository = dependencies.getMappingRepository();
    const apiKeyService = dependencies.getApiKeyService();
    const pendingId = getPendingId(connectorId, config.credentialRevision);

    if (!wasSuccessful) {
      const pending = await repository.resolve(pendingId, spaceId);
      if (pending) {
        await apiKeyService.invalidate(pending.attributes.payload);
        await repository.deletePending(pendingId, spaceId);
      }
      return;
    }

    const { previous } = await repository.promote({
      pendingId,
      spaceId,
      savedObjectsClient: await dependencies.getSavedObjectsClient(request),
    });
    if (previous) {
      await apiKeyService.invalidate(previous.attributes.payload);
    }
  },
  postDeleteHook: async ({ connectorId, request }) => {
    const spaceId = dependencies.getSpaceId(request);
    const repository = dependencies.getMappingRepository();
    const mappings = await repository.getForConnector(connectorId, spaceId);
    await Promise.all(
      mappings.map(({ attributes }) =>
        dependencies.getApiKeyService().invalidate(attributes.payload)
      )
    );
    await repository.deleteForConnector(connectorId, spaceId);
  },
  executor: async (
    options: ActionTypeExecutorOptions<
      InboundWebhookConfig,
      InboundWebhookSecrets,
      InboundWebhookParams
    >
  ): Promise<ActionTypeExecutorResult<InboundWebhookResult>> => {
    const { actionId, config, logger, params, request, services } = options;
    let scopedRequest = request ?? dependencies.takeRequest(params.subActionParams.eventId);

    if (!scopedRequest) {
      scopedRequest = await createDelegatedInboundWebhookExecutionRequest(dependencies, {
        connectorId: actionId,
        credentialRevision: params.subActionParams.credentialRevision,
        savedObjectsClient: services.savedObjectsClient,
      });
    }

    if (!scopedRequest) {
      throw new Error(
        'Inbound webhook execution requires active delegated credentials. Save the connector and wait until its status is active before testing.'
      );
    }
    if (config.credentialRevision !== params.subActionParams.credentialRevision) {
      throw new Error('Inbound webhook credential revision is stale');
    }

    const event: InboundWebhookEvent = {
      connectorId: actionId,
      eventId: params.subActionParams.eventId,
      body: params.subActionParams.body,
      query: params.subActionParams.query,
      headers: params.subActionParams.headers,
      receivedAt: params.subActionParams.receivedAt,
    };
    logger.debug(`Inbound webhook event received: ${JSON.stringify(event)}`);
    void dependencies.emitEvent(scopedRequest, INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID, event);
    return {
      status: 'ok',
      actionId,
      data: { eventId: event.eventId, accepted: true },
    };
  },
});

export type {
  InboundWebhookConfig,
  InboundWebhookEvent,
  InboundWebhookParams,
  InboundWebhookResult,
  InboundWebhookSecrets,
} from './types';
