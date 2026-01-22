/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { WorkflowsExtensionsExamplePluginStartDeps } from '../plugin';

/**
 * Route handler for event emission.
 * Uses WorkflowsExtensionsServerPluginStart.emitEvent to emit events.
 */
export function registerEmitEventRoute(
  router: IRouter,
  getStartServices: () => Promise<[any, WorkflowsExtensionsExamplePluginStartDeps, unknown]>
) {
  router.post(
    {
      path: '/internal/workflowsExtensionsExample/emit_event',
      validate: {
        body: schema.object({
          triggerType: schema.string(),
          payload: schema.recordOf(schema.string(), schema.any()),
        }),
      },
      // Note: Authentication is required to create API keys for workflow execution
      // We keep authz enabled (default) to ensure the request is authenticated
      security: {
        authz: {
          requiredPrivileges: ['read'], // No specific privileges required, just authentication
        },
      },
    },
    async (context, request, response) => {
      try {
        const [, plugins] = await getStartServices();
        const workflowsExtensions = plugins.workflowsExtensions;
        
        if (!workflowsExtensions) {
          return response.badRequest({
            body: {
              message: 'Workflows extensions service not available',
            },
          });
        }

        const result = await workflowsExtensions.emitEvent({
          triggerType: request.body.triggerType,
          payload: request.body.payload,
          kibanaRequest: request,
        });

        return response.ok({
          body: {
            eventId: result.eventId,
          },
        });
      } catch (error: any) {
        return response.badRequest({
          body: {
            message: error.message || 'Unknown error',
          },
        });
      }
    }
  );
}
