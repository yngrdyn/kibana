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
    preSaveHook: async ({ connectorId, config, request, isUpdate }) => {
      const spaceId = getSpaceId(request);
      const configRecord = config as Record<string, unknown>;

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

      if (!token) {
        return;
      }

      configRecord.ingestTokenHash = computeIngestTokenHash({
        connectorId,
        spaceId,
        token,
      });
      configRecord.webhookUrl = `${getPublicBaseUrl()}/api/events/v1/inboundWebhook/${connectorId}?token=${token}`;
    },
  });
}

export { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID };
