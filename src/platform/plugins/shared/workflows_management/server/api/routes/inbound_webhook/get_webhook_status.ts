/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { KibanaRequest } from '@kbn/core/server';
import type { InboundWebhookMappingRepository } from '../../../storage/inbound_webhook_mapping_repository';
import type { WorkflowsRouter } from '../../../types';
import { WORKFLOW_READ_SECURITY } from '../utils/route_security';

export const registerGetInboundWebhookStatusRoute = ({
  router,
  getMappingRepository,
  getSpaceId,
}: {
  router: WorkflowsRouter;
  getMappingRepository: () => InboundWebhookMappingRepository;
  getSpaceId: (request: KibanaRequest) => string;
}): void => {
  router.get(
    {
      path: '/internal/workflows/inbound_webhook/{connectorId}/status',
      security: WORKFLOW_READ_SECURITY,
      options: { access: 'internal' },
      validate: {
        params: schema.object({ connectorId: schema.string() }),
      },
    },
    async (context, request, response) => {
      try {
        const actionsClient = (await context.actions).getActionsClient();
        await actionsClient.get({ id: request.params.connectorId });
        const mappings = await getMappingRepository().getForConnector(
          request.params.connectorId,
          getSpaceId(request)
        );
        const active = mappings.find(({ attributes }) => attributes.payload.status === 'active');
        const pending = mappings.find(({ attributes }) => attributes.payload.status === 'pending');
        if (pending) {
          return response.ok({
            body: {
              status: 'updating',
              credentialRevision: pending.attributes.payload.credentialRevision,
            },
          });
        }
        if (!active) {
          return response.ok({ body: { status: 'disabled' } });
        }
        return response.ok({
          body: {
            status: 'active',
            credentialRevision: active.attributes.payload.credentialRevision,
            credentialVersion: active.attributes.payload.secrets.credentialVersion,
            delegatedUsername: active.attributes.payload.delegatedUsername,
          },
        });
      } catch {
        return response.notFound();
      }
    }
  );
};
