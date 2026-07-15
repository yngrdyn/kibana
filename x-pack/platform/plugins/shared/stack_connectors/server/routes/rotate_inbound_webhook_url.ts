/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isBoom } from '@hapi/boom';
import { schema } from '@kbn/config-schema';
import { CONNECTOR_ID_MAX_LENGTH, validateConnectorId } from '@kbn/actions-plugin/common';
import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';
import type { IRouter, KibanaRequest, Logger, StartServicesAccessor } from '@kbn/core/server';

import { INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../common';
import { mintInboundWebhookIngressCredentials } from '../connector_types_from_spec/ensure_inbound_webhook_ingress_credentials';
import type { ConnectorsPluginsStart } from '../plugin';

export const rotateInboundWebhookUrlRoute = ({
  router,
  getStartServices,
  getPublicBaseUrl,
  getSpaceId,
  logger,
}: {
  router: IRouter;
  getStartServices: StartServicesAccessor<ConnectorsPluginsStart, unknown>;
  getPublicBaseUrl: () => string;
  getSpaceId: (request: KibanaRequest) => string;
  logger: Logger;
}): void => {
  router.post(
    {
      path: `${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/inbound_webhook/_rotate_url`,
      security: {
        authz: {
          enabled: false,
          reason:
            'This route is opted out from authorization because it relies on the Actions authorization model (create).',
        },
      },
      validate: {
        body: schema.object({
          connectorId: schema.string({ minLength: 1, maxLength: CONNECTOR_ID_MAX_LENGTH }),
        }),
      },
      options: {
        access: 'internal',
      },
    },
    async (_ctx, req, res) => {
      const { connectorId } = req.body;

      try {
        validateConnectorId(connectorId);
      } catch (error) {
        return res.badRequest({
          body: error instanceof Error ? error.message : 'Invalid connector ID',
        });
      }

      try {
        const [, { actions }] = await getStartServices();
        await actions.getActionsAuthorizationWithRequest(req).ensureAuthorized({
          operation: 'create',
          actionTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
        });

        return res.ok({
          body: mintInboundWebhookIngressCredentials({
            connectorId,
            spaceId: getSpaceId(req),
            publicBaseUrl: getPublicBaseUrl(),
          }),
        });
      } catch (error) {
        if (isBoom(error)) {
          return res.customError({
            statusCode: error.output.statusCode,
            body: { message: error.message },
          });
        }
        logger.error(`Failed to rotate inbound webhook URL: ${error}`);
        return res.customError({
          statusCode: 500,
          body: { message: 'Failed to rotate inbound webhook URL' },
        });
      }
    }
  );
};
