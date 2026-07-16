/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import { createConnectorTypeFromSpec } from '@kbn/actions-plugin/server/lib';
import { InboundWebhookConnector } from '@kbn/connector-specs/src/specs/inbound_webhook/inbound_webhook';
import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';
import type { KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';
import { z } from '@kbn/zod/v4';

import { ensureConnectorIngressCredentials } from './ensure_connector_ingress_credentials';
import {
  DELEGATED_API_KEY_ID_CONFIG,
  DELEGATED_API_KEY_SECRET,
  DELEGATED_UIAM_API_KEY_ID_CONFIG,
  DELEGATED_UIAM_API_KEY_SECRET,
  InboundWebhookApiKeyService,
} from './inbound_webhook_api_key_service';

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
}: {
  actions: ActionsPluginSetupContract;
  getSpaceId: (request: KibanaRequest) => string;
  getPublicBaseUrl: () => string;
  getSecurity: () => Promise<SecurityServiceStart>;
  logger: Logger;
}): void {
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

      ensureConnectorIngressCredentials({
        config: configRecord,
        connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
        connectorId,
        spaceId,
        publicBaseUrl: getPublicBaseUrl(),
        isUpdate,
        logger,
      });

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
