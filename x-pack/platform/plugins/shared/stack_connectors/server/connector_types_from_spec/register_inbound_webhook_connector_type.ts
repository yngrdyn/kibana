/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomBytes } from 'node:crypto';

import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import { createConnectorTypeFromSpec } from '@kbn/actions-plugin/server/lib';
import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';
import { InboundWebhookConnector } from '@kbn/connector-specs/src/specs/inbound_webhook/inbound_webhook';
import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';
import type { KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';
import { z } from '@kbn/zod/v4';

import {
  DELEGATED_API_KEY_ID_CONFIG,
  DELEGATED_API_KEY_SECRET,
  DELEGATED_UIAM_API_KEY_ID_CONFIG,
  DELEGATED_UIAM_API_KEY_SECRET,
  InboundWebhookApiKeyService,
} from './inbound_webhook_api_key_service';

export interface RegisterInboundWebhookConnectorTypeParams {
  actions: ActionsPluginSetupContract;
  getSpaceId: (request: KibanaRequest) => string;
  getPublicBaseUrl: () => string;
  getSecurity: () => Promise<SecurityServiceStart>;
  logger: Logger;
}

const inboundWebhookSecretsSchema = z.object({
  authType: z.literal('none').optional(),
  [DELEGATED_API_KEY_SECRET]: z.string().optional(),
  [DELEGATED_UIAM_API_KEY_SECRET]: z.string().optional(),
});

export function registerInboundWebhookConnectorType({
  actions,
  getSpaceId,
  getPublicBaseUrl,
  getSecurity,
  logger,
}: RegisterInboundWebhookConnectorTypeParams): void {
  const connectorType = createConnectorTypeFromSpec(InboundWebhookConnector, actions);
  const apiKeyServicePromise = getSecurity().then(
    (security) => new InboundWebhookApiKeyService(security, logger)
  );

  actions.registerType({
    ...connectorType,
    validate: {
      ...connectorType.validate,
      secrets: {
        schema: inboundWebhookSecretsSchema,
      },
    },
    preSaveHook: async ({ connectorId, config, secrets, request, isUpdate }) => {
      const spaceId = getSpaceId(request);
      const configRecord = config as Record<string, unknown>;
      const secretsRecord = secrets as Record<string, unknown>;

      const existingWebhookUrl =
        typeof configRecord.webhookUrl === 'string' ? configRecord.webhookUrl : undefined;
      let token: string | undefined;
      if (existingWebhookUrl) {
        try {
          token = new URL(existingWebhookUrl).searchParams.get('token') ?? undefined;
        } catch {
          token = undefined;
        }
      }

      if (!token && !isUpdate && typeof configRecord.ingestTokenHash !== 'string') {
        token = randomBytes(32).toString('hex');
      }

      if (token) {
        configRecord.ingestTokenHash = computeIngestTokenHash({
          connectorId,
          spaceId,
          token,
        });
        configRecord.webhookUrl = `${getPublicBaseUrl()}/api/events/v1/inboundWebhook/${connectorId}?token=${token}`;
      }

      const hasDelegatedKey =
        typeof secretsRecord[DELEGATED_API_KEY_SECRET] === 'string' &&
        secretsRecord[DELEGATED_API_KEY_SECRET].length > 0;

      if (hasDelegatedKey) {
        return;
      }

      const apiKeyService = await apiKeyServicePromise;
      const credentials = await apiKeyService.grant(request, connectorId);

      configRecord[DELEGATED_API_KEY_ID_CONFIG] = credentials[DELEGATED_API_KEY_ID_CONFIG];
      if (credentials[DELEGATED_UIAM_API_KEY_ID_CONFIG]) {
        configRecord[DELEGATED_UIAM_API_KEY_ID_CONFIG] =
          credentials[DELEGATED_UIAM_API_KEY_ID_CONFIG];
      }

      secretsRecord[DELEGATED_API_KEY_SECRET] = credentials.secrets[DELEGATED_API_KEY_SECRET];
      if (credentials.secrets[DELEGATED_UIAM_API_KEY_SECRET]) {
        secretsRecord[DELEGATED_UIAM_API_KEY_SECRET] =
          credentials.secrets[DELEGATED_UIAM_API_KEY_SECRET];
      }
    },
    postDeleteHook: async ({ connectorId, config }) => {
      const configRecord = config as Record<string, unknown>;
      const apiKeyId =
        typeof configRecord[DELEGATED_API_KEY_ID_CONFIG] === 'string'
          ? configRecord[DELEGATED_API_KEY_ID_CONFIG]
          : undefined;
      const uiamApiKeyId =
        typeof configRecord[DELEGATED_UIAM_API_KEY_ID_CONFIG] === 'string'
          ? configRecord[DELEGATED_UIAM_API_KEY_ID_CONFIG]
          : undefined;
      if (!apiKeyId && !uiamApiKeyId) {
        return;
      }
      const apiKeyService = await apiKeyServicePromise;
      await apiKeyService.invalidate({ apiKeyId, uiamApiKeyId });
      logger.debug(`Invalidated inbound webhook credentials for connector ${connectorId}`);
    },
  });
}

export { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID };
