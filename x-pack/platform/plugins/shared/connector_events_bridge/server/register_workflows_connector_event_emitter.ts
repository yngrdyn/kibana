/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import type { ConnectorEventEmitter } from '@kbn/actions-plugin/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';

export function registerWorkflowsConnectorEventEmitter({
  actions,
  getWorkflowsExtensionsStart,
  logger,
}: {
  actions: ActionsPluginSetupContract;
  getWorkflowsExtensionsStart: () => Promise<WorkflowsExtensionsServerPluginStart | undefined>;
  logger: Logger;
}): void {
  const emitter: ConnectorEventEmitter = {
    emit: async ({ eventId, payload, spaceId }) => {
      const workflowsExtensions = await getWorkflowsExtensionsStart();
      if (!workflowsExtensions) {
        logger.warn(
          `Workflows extensions unavailable; skipping connector event emit for ${eventId}`
        );
        return;
      }

      const request = kibanaRequestFactory({
        headers: {},
        spaceId: asSpaceId(spaceId),
      });

      const workflowsClient = await workflowsExtensions.getClient(request);
      await workflowsClient.emitEvent(eventId, payload);
    },
  };

  actions.registerConnectorEventEmitter(emitter);
}
