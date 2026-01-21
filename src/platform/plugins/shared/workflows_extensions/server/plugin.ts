/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Logger, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { registerGetStepDefinitionsRoute } from './routes/get_step_definitions';
import { registerGetTriggersRoute } from './routes/get_triggers';
import { registerTestEmitEventRoute } from './routes/test_emit_event';
import { ServerStepRegistry } from './step_registry';
import { TriggerRegistry } from './trigger_registry';
import { registerInternalStepDefinitions } from './steps';
import { emitEvent } from './emit_event';
import type {
  WorkflowsExtensionsServerPluginSetup,
  WorkflowsExtensionsServerPluginSetupDeps,
  WorkflowsExtensionsServerPluginStart,
  WorkflowsExtensionsServerPluginStartDeps,
} from './types';

export class WorkflowsExtensionsServerPlugin
  implements
    Plugin<
      WorkflowsExtensionsServerPluginSetup,
      WorkflowsExtensionsServerPluginStart,
      WorkflowsExtensionsServerPluginSetupDeps,
      WorkflowsExtensionsServerPluginStartDeps
    >
{
  private readonly stepRegistry: ServerStepRegistry;
  private readonly triggerRegistry: TriggerRegistry;

  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.stepRegistry = new ServerStepRegistry();
    this.triggerRegistry = new TriggerRegistry();
    this.logger = initializerContext.logger.get();
  }

  public setup(
    core: CoreSetup<WorkflowsExtensionsServerPluginStartDeps>,
    plugins: WorkflowsExtensionsServerPluginSetupDeps
  ): WorkflowsExtensionsServerPluginSetup {
    const router = core.http.createRouter();

    // Register HTTP routes to expose step definitions and triggers for testing
    registerGetStepDefinitionsRoute(router, this.stepRegistry);
    registerGetTriggersRoute(router, this.triggerRegistry);
    registerTestEmitEventRoute(router, () => core.getStartServices());
    registerInternalStepDefinitions(core, this.stepRegistry);

    // Register saved object type for storing encrypted API keys
    core.savedObjects.registerType({
      name: 'workflow-event-api-key',
      hidden: true,
      namespaceType: 'single',
      mappings: {
        properties: {
          apiKey: { type: 'binary' }, // Encrypted API key value
          apiKeyId: { type: 'keyword' },
          eventId: { type: 'keyword' },
          triggerType: { type: 'keyword' },
          spaceId: { type: 'keyword' },
        },
      },
    });

    // Register with EncryptedSavedObjects to encrypt the apiKey attribute
    if (plugins.encryptedSavedObjects) {
      plugins.encryptedSavedObjects.registerType({
        type: 'workflow-event-api-key',
        attributesToEncrypt: new Set(['apiKey']),
        attributesToIncludeInAAD: new Set(['apiKeyId', 'eventId', 'triggerType', 'spaceId']),
      });
    }

    return {
      registerStepDefinition: (definition) => {
        this.stepRegistry.register(definition);
      },
      registerTrigger: (definition) => {
        this.triggerRegistry.registerTrigger(definition);
      },
    };
  }

  public start(
    core: CoreStart,
    plugins: WorkflowsExtensionsServerPluginStartDeps
  ): WorkflowsExtensionsServerPluginStart {
    const esClient = core.elasticsearch.client.asInternalUser;
    const indexName = '.workflows-events-poc';

    return {
      getStepDefinition: (stepTypeId: string) => {
        return this.stepRegistry.get(stepTypeId);
      },
      hasStepDefinition: (stepTypeId: string) => {
        return this.stepRegistry.has(stepTypeId);
      },
      getAllStepDefinitions: () => {
        return this.stepRegistry.getAll();
      },
      getTrigger: (triggerId: string) => {
        return this.triggerRegistry.getTrigger(triggerId);
      },
      hasTrigger: (triggerId: string) => {
        return this.triggerRegistry.hasTrigger(triggerId);
      },
      getAllTriggers: () => {
        return this.triggerRegistry.getAllTriggers();
      },
      emitEvent: async (params) => {
        return emitEvent(params, {
          triggerRegistry: this.triggerRegistry,
          esClient,
          spaces: plugins.spaces,
          logger: this.logger,
          indexName,
          security: core.security?.authc
            ? {
                authc: {
                  ...(core.security.authc.apiKeys && {
                    apiKeys: {
                      grantAsInternalUser: async (request, params) => {
                        return core.security!.authc.apiKeys!.grantAsInternalUser(request, {
                          name: params.name,
                          role_descriptors: params.role_descriptors || {},
                          metadata: params.metadata,
                        });
                      },
                    },
                  }),
                  getCurrentUser: (request) => {
                    return core.security!.authc.getCurrentUser(request);
                  },
                },
              }
            : undefined,
          encryptedSavedObjects: plugins.encryptedSavedObjects
            ? {
                getClient: (options?: { includedHiddenTypes?: string[] }) => {
                  return plugins.encryptedSavedObjects!.getClient(options);
                },
              }
            : undefined,
          savedObjects: core.savedObjects
            ? {
                getScopedClient: (request, options?) => {
                  return core.savedObjects.getScopedClient(request, options);
                },
              }
            : undefined,
        });
      },
    };
  }

  public stop() {}
}
