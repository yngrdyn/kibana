/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter } from '@kbn/core/server';
import type { TriggerRegistry } from '../trigger_registry';
import { createSHA256Hash } from '@kbn/crypto';

const ROUTE_PATH = '/internal/workflows_extensions/triggers';

/**
 * Registers the route to get all registered triggers.
 * This endpoint is used for testing and debugging.
 */
export function registerGetTriggersRoute(
  router: IRouter,
  registry: TriggerRegistry
): void {
  router.get(
    {
      path: ROUTE_PATH,
      options: {
        access: 'internal',
      },
      security: {
        authz: {
          enabled: false,
          reason: 'This route is used for testing purposes only. No sensitive data is exposed.',
        },
      },
      validate: false,
    },
    async (_context, _request, response) => {
      const allTriggers = registry.getAllTriggers();
      const triggers  = allTriggers
      // create a hash of the schema to detect changes in the trigger definition
        .map(({ id, eventSchema }) => ({ id, schemaHash: createSHA256Hash(eventSchema.toString()) }))
        .sort((a, b) => a.id.localeCompare(b.id));

      return response.ok({ body: { triggers } });
    }
  );
}
