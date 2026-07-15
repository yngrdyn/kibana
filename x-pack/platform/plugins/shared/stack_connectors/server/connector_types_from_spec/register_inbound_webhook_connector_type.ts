/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomBytes } from 'node:crypto';

import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import { createConnectorTypeFromSpec } from '@kbn/actions-plugin/server/lib';
import {
  InboundWebhookConnector,
  computeIngestTokenHash,
  INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
} from '@kbn/connector-specs';
import type { KibanaRequest } from '@kbn/core/server';

export interface RegisterInboundWebhookConnectorTypeParams {
  actions: ActionsPluginSetupContract;
  getSpaceId: (request: KibanaRequest) => string;
  getPublicBaseUrl: () => string;
}

export function registerInboundWebhookConnectorType({
  actions,
  getSpaceId,
  getPublicBaseUrl,
}: RegisterInboundWebhookConnectorTypeParams): void {
  const connectorType = createConnectorTypeFromSpec(InboundWebhookConnector, actions);

  actions.registerType({
    ...connectorType,
    preSaveHook: async ({ connectorId, config, secrets, request, isUpdate }) => {
      const spaceId = getSpaceId(request);
      const configRecord = config as Record<string, unknown>;
      const secretsRecord = secrets as Record<string, unknown>;

      let token =
        typeof secretsRecord.ingestToken === 'string' && secretsRecord.ingestToken.length > 0
          ? secretsRecord.ingestToken
          : undefined;

      if (!token && !isUpdate && typeof configRecord.ingestTokenHash !== 'string') {
        token = randomBytes(32).toString('hex');
      }

      if (token) {
        configRecord.ingestTokenHash = computeIngestTokenHash({
          connectorId,
          spaceId,
          token,
        });
        secretsRecord.webhookUrl = `${getPublicBaseUrl()}/api/events/v1/inboundWebhook/${connectorId}?token=${token}`;
        configRecord.webhookUrl = secretsRecord.webhookUrl;
        delete secretsRecord.ingestToken;
      }
    },
  });
}

export { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID };
