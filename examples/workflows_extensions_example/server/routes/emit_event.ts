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
import type { WorkflowsExtensionsPluginRequestHandlerContext } from '@kbn/workflows-extensions/server';

/**
 * Route handler for event emission.
 * Uses the workflows context handler to emit events.
 * The kibanaRequest is automatically injected by the context handler.
 */
export function registerEmitEventRoute(
  router: IRouter<WorkflowsExtensionsPluginRequestHandlerContext>
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
        const workflowsContext = await context.workflows;

        const result = await workflowsContext.emitEvent(
          request.body.triggerType,
          request.body.payload
        );

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
