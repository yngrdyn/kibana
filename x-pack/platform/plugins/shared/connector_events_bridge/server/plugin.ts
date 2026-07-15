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

import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';

import { registerWorkflowsConnectorEventEmitter } from './register_workflows_connector_event_emitter';

export interface ConnectorEventsBridgeSetupDeps {
  actions: ActionsPluginSetupContract;
}

export interface ConnectorEventsBridgeStartDeps {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
}

export class ConnectorEventsBridgePlugin
  implements Plugin<{}, {}, ConnectorEventsBridgeSetupDeps, ConnectorEventsBridgeStartDeps>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  setup(
    core: CoreSetup<ConnectorEventsBridgeStartDeps>,
    { actions }: ConnectorEventsBridgeSetupDeps
  ) {
    registerWorkflowsConnectorEventEmitter({
      actions,
      getWorkflowsExtensionsStart: async () => {
        const [, startPlugins] = await core.getStartServices();
        return startPlugins.workflowsExtensions;
      },
      logger: this.logger.get('workflowsEmitter'),
    });

    return {};
  }

  start() {
    return {};
  }
}
