/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHash, randomUUID } from 'crypto';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { schema } from '@kbn/config-schema';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { InboundWebhookApiKeyService } from '../../../services/inbound_webhook_api_key_service';
import type { InboundWebhookRequestStore } from '../../../services/inbound_webhook_request_store';
import type { InboundWebhookMappingRepository } from '../../../storage/inbound_webhook_mapping_repository';
import type { WorkflowsRouter } from '../../../types';

const MAX_BODY_BYTES = 1024 * 1024;
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'host',
  'proxy-authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

const filterHeaders = (headers: KibanaRequest['headers']): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) => {
      const normalizedName = name.toLowerCase();
      if (
        SENSITIVE_HEADERS.has(normalizedName) ||
        (!normalizedName.startsWith('x-') &&
          normalizedName !== 'content-type' &&
          normalizedName !== 'user-agent')
      ) {
        return [];
      }
      const normalizedValue = Array.isArray(value) ? value.join(',') : value;
      return typeof normalizedValue === 'string' ? [[normalizedName, normalizedValue]] : [];
    })
  );

export interface InboundWebhookRouteDependencies {
  router: WorkflowsRouter;
  getActionsClient: (request: KibanaRequest, spaceId: string) => Promise<ActionsClient>;
  getApiKeyService: () => InboundWebhookApiKeyService;
  getMappingRepository: () => InboundWebhookMappingRepository;
  getSpaceId: (request: KibanaRequest) => string;
  logger: Logger;
  requestStore: InboundWebhookRequestStore;
}

export const registerPostInboundWebhookRoute = ({
  router,
  getActionsClient,
  getApiKeyService,
  getMappingRepository,
  getSpaceId,
  logger,
  requestStore,
}: InboundWebhookRouteDependencies): void => {
  router.post(
    {
      path: '/api/webhooks/{webhookKey}',
      security: {
        authc: {
          enabled: false,
          reason: 'The webhook URL contains the credential used to authenticate the caller',
        },
        authz: {
          enabled: false,
          reason:
            'Authorization is delegated to the encrypted webhook mapping and a user-scoped Actions client',
        },
      },
      options: {
        access: 'public',
        xsrfRequired: false,
        tags: ['api'],
        body: {
          accepts: ['application/json'],
          maxBytes: MAX_BODY_BYTES,
        },
      },
      validate: {
        params: schema.object({
          webhookKey: schema.string({
            validate: (value) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
                ? undefined
                : 'must be a UUID v4',
          }),
        }),
        query: schema.recordOf(
          schema.string(),
          schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
        ),
        body: schema.recordOf(schema.string(), schema.any()),
      },
    },
    async (_context, request, response) => {
      const spaceId = getSpaceId(request);
      const webhookKeyHash = createHash('sha256').update(request.params.webhookKey).digest('hex');
      let mapping;
      try {
        mapping = await getMappingRepository().resolve(webhookKeyHash, spaceId);
      } catch {
        return response.notFound();
      }
      const payload = mapping?.attributes.payload;
      if (
        !payload ||
        payload.status !== 'active' ||
        payload.connectorTypeId !== '.workflows-inbound-webhook'
      ) {
        return response.notFound();
      }

      try {
        const authorization = getApiKeyService().getAuthorizationHeader(payload.secrets);
        const fakeRequest = kibanaRequestFactory({
          headers: { authorization },
          spaceId: asSpaceId(spaceId),
        });
        const actionsClient = await getActionsClient(fakeRequest, spaceId);
        const eventId = randomUUID();
        requestStore.set(eventId, fakeRequest);
        const result = await (async () => {
          try {
            return await actionsClient.execute({
              actionId: payload.connectorId,
              params: {
                subAction: 'receive',
                subActionParams: {
                  eventId,
                  credentialRevision: payload.credentialRevision,
                  body: request.body,
                  query: request.query,
                  headers: filterHeaders(request.headers),
                  receivedAt: new Date().toISOString(),
                },
              },
            });
          } finally {
            requestStore.delete(eventId);
          }
        })();
        if (result.status !== 'ok') {
          logger.warn(
            `Inbound webhook connector execution failed: connectorId=${payload.connectorId} eventId=${eventId} spaceId=${spaceId}`
          );
          return response.customError({ statusCode: 503, body: 'Webhook delivery failed' });
        }
        logger.info(
          `Inbound webhook event accepted: connectorId=${payload.connectorId} eventId=${eventId} spaceId=${spaceId}`
        );
        return response.accepted({ body: { accepted: true, eventId } });
      } catch (error) {
        logger.warn(
          `Inbound webhook delivery failed: connectorId=${payload.connectorId} spaceId=${spaceId}`,
          { error }
        );
        return response.customError({ statusCode: 503, body: 'Webhook delivery failed' });
      }
    }
  );
};
