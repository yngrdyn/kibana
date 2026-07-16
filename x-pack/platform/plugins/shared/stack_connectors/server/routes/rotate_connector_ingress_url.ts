/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isBoom } from '@hapi/boom';
import { schema } from '@kbn/config-schema';
import { CONNECTOR_ID_MAX_LENGTH, validateConnectorId } from '@kbn/actions-plugin/common';
import { normalizeConnectorTypeId } from '@kbn/connector-specs';
import { getConnectorSpec } from '@kbn/connector-specs/server';
import type { IRouter, KibanaRequest, Logger, StartServicesAccessor } from '@kbn/core/server';

import { INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../common';
import { mintConnectorIngressCredentials } from '../connector_types_from_spec/ensure_connector_ingress_credentials';
import type { ConnectorsPluginsStart } from '../plugin';

export const rotateConnectorIngressUrlRoute = ({
  router,
  getStartServices,
  getPublicBaseUrl,
  getSpaceId,
  logger,
}: {
  router: IRouter;
  getStartServices: StartServicesAccessor<ConnectorsPluginsStart, unknown>;
  getPublicBaseUrl: (request: KibanaRequest) => string;
  getSpaceId: (request: KibanaRequest) => string;
  logger: Logger;
}): void => {
  router.post(
    {
      path: `${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/connector_ingress/_rotate_url`,
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
          connectorTypeId: schema.string({ minLength: 1 }),
        }),
      },
      options: {
        access: 'internal',
      },
    },
    async (_ctx, req, res) => {
      const { connectorId, connectorTypeId: rawConnectorTypeId } = req.body;

      try {
        validateConnectorId(connectorId);
      } catch (error) {
        return res.badRequest({
          body: error instanceof Error ? error.message : 'Invalid connector ID',
        });
      }

      const connectorTypeId = normalizeConnectorTypeId(rawConnectorTypeId);
      const spec = getConnectorSpec(connectorTypeId);
      if (!spec?.events) {
        return res.badRequest({
          body: `Connector type "${connectorTypeId}" does not support ingress events`,
        });
      }

      try {
        const [, { actions }] = await getStartServices();
        await actions.getActionsAuthorizationWithRequest(req).ensureAuthorized({
          operation: 'create',
          actionTypeId: connectorTypeId,
        });

        return res.ok({
          body: mintConnectorIngressCredentials({
            connectorTypeId,
            connectorId,
            spaceId: getSpaceId(req),
            publicBaseUrl: getPublicBaseUrl(req),
          }),
        });
      } catch (error) {
        if (isBoom(error)) {
          return res.customError({
            statusCode: error.output.statusCode,
            body: { message: error.message },
          });
        }
        logger.error(`Failed to rotate connector ingress URL: ${error}`);
        return res.customError({
          statusCode: 500,
          body: { message: 'Failed to rotate connector ingress URL' },
        });
      }
    }
  );
};
