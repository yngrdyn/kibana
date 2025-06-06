/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import Boom from '@hapi/boom';
import { pipe } from 'fp-ts/pipeable';
import { fold } from 'fp-ts/Either';
import { identity } from 'fp-ts/function';
import { throwErrors } from '@kbn/io-ts-utils';
import type { InfraBackendLibs } from '../../lib/infra_types';

import {
  InventoryMetaRequestRT,
  InventoryMetaResponseRT,
} from '../../../common/http_api/inventory_meta_api';
import { getCloudMetadata } from './lib/get_cloud_metadata';

const escapeHatch = schema.object({}, { unknowns: 'allow' });

export const initInventoryMetaRoute = (libs: InfraBackendLibs) => {
  const { framework } = libs;

  framework.registerRoute(
    {
      method: 'post',
      path: '/api/infra/inventory/meta',
      validate: {
        body: escapeHatch,
      },
    },
    async (requestContext, request, response) => {
      const { sourceId, nodeType, currentTime } = pipe(
        InventoryMetaRequestRT.decode(request.body),
        fold(throwErrors(Boom.badRequest), identity)
      );

      const soClient = (await requestContext.core).savedObjects.client;
      const { configuration } = await libs.sources.getSourceConfiguration(soClient, sourceId);

      const awsMetadata = await getCloudMetadata(
        framework,
        requestContext,
        configuration,
        nodeType,
        currentTime
      );

      return response.ok({
        body: InventoryMetaResponseRT.encode(awsMetadata),
      });
    }
  );
};
