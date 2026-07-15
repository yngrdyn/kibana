/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type {
  CoreSetup,
  IRouter,
  KibanaRequest,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';

import type { ActionsConfig } from '../config';
import type {
  ActionsRequestHandlerContext,
  ActionTypeRegistry,
  ConnectorEventEmitParams,
  InMemoryConnector,
} from '../types';
import type { ActionsPluginsStart } from '../plugin';
import { handleInboundRequest } from './handle_inbound_request';

export interface InboundConnectorLoaderDeps {
  encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  inMemoryConnectors: InMemoryConnector[];
  actionTypeRegistry: ActionTypeRegistry;
  isESOCanEncrypt: boolean;
  getSpaceId: (request: KibanaRequest) => string;
}

export interface RegisterInboundRoutesParams {
  router: IRouter<ActionsRequestHandlerContext>;
  inboundConnectorsConfig: ActionsConfig['inboundConnectors'];
  logger: Logger;
  emitConnectorEvents: (params: ConnectorEventEmitParams) => Promise<void>;
  loaderDeps: Omit<
    InboundConnectorLoaderDeps,
    'encryptedSavedObjectsClient' | 'unsecuredSavedObjectsClient'
  > & {
    getStartServices: CoreSetup<ActionsPluginsStart>['getStartServices'];
  };
}

export const INBOUND_CONNECTOR_EVENTS_SECURITY = {
  authc: {
    enabled: false,
    reason: 'Inbound connector events authenticate with connector-scoped ingest tokens.',
  },
  authz: {
    enabled: false,
    reason: 'Authorization is delegated to connector ingress token verification.',
  },
} as const;

export function registerInboundRoutes({
  router,
  inboundConnectorsConfig,
  logger,
  emitConnectorEvents,
  loaderDeps,
}: RegisterInboundRoutesParams): void {
  router.post(
    {
      path: '/api/events/v1/{typeId}/{connectorId}',
      security: INBOUND_CONNECTOR_EVENTS_SECURITY,
      options: {
        access: 'public',
        xsrfRequired: false,
        tags: ['api'],
        body: {
          accepts: ['application/json', 'application/*+json', '*/*'],
          maxBytes: inboundConnectorsConfig.maxBodyBytes,
        },
      },
      validate: {
        params: schema.object({
          typeId: schema.string({ minLength: 1 }),
          connectorId: schema.string({ minLength: 1 }),
        }),
        query: schema.recordOf(
          schema.string(),
          schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
        ),
        body: schema.maybe(schema.any()),
      },
    },
    async (_context, request, response) => {
      const [coreStart, startPlugins] = await loaderDeps.getStartServices();
      const spaceId = loaderDeps.getSpaceId(request);
      const internalRequest = kibanaRequestFactory({
        headers: {},
        spaceId: asSpaceId(spaceId),
      });
      const unsecuredSavedObjectsClient = coreStart.savedObjects.getScopedClient(internalRequest);
      const encryptedSavedObjectsClient = startPlugins.encryptedSavedObjects.getClient({
        includedHiddenTypes: ['action'],
      });

      return handleInboundRequest({
        request,
        response,
        typeId: request.params.typeId,
        connectorId: request.params.connectorId,
        inboundConnectorsConfig,
        emitConnectorEvents,
        logger,
        getSpaceId: loaderDeps.getSpaceId,
        encryptedSavedObjectsClient,
        unsecuredSavedObjectsClient,
        inMemoryConnectors: loaderDeps.inMemoryConnectors,
        actionTypeRegistry: loaderDeps.actionTypeRegistry,
        isESOCanEncrypt: loaderDeps.isESOCanEncrypt,
      });
    }
  );
}
