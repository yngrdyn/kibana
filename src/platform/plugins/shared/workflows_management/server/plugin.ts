/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core/server';

import { defineRoutes } from './api/routes';
import { registerGetInboundWebhookStatusRoute } from './api/routes/inbound_webhook/get_webhook_status';
import { registerPostInboundWebhookRoute } from './api/routes/inbound_webhook/post_webhook';
import { WorkflowManagementAuditLog } from './api/routes/utils/workflow_audit_logging';
import { WorkflowsManagementApi } from './api/workflows_management_api';
import { WorkflowsService } from './api/workflows_management_service';
import { AvailabilityUpdater } from './availability';
import {
  createManagedWorkflowsSystemApiProvider,
  createWorkflowsClientProvider,
} from './client/workflows_client';
import type { WorkflowsManagementConfig } from './config';
import { getInboundWebhookConnectorType } from './connectors/inbound_webhook';
import {
  getWorkflowsConnectorAdapter,
  getConnectorType as getWorkflowsConnectorType,
} from './connectors/workflows';
import { WorkflowsManagementFeatureConfig } from './features';
import { createWorkflowsInboxProvider } from './inbox/workflows_inbox_provider';
import {
  INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
  inboundWebhookSavedObjectType,
} from './saved_objects/inbound_webhook';
import { InboundWebhookApiKeyService } from './services/inbound_webhook_api_key_service';
import { InboundWebhookRequestStore } from './services/inbound_webhook_request_store';
import { InboundWebhookMappingRepository } from './storage/inbound_webhook_mapping_repository';
import {
  registerInboundWebhookCleanupTask,
  scheduleInboundWebhookCleanupTask,
} from './tasks/inbound_webhook_cleanup_task';
import { registerTriggerDefinitions } from './triggers';
import type {
  WorkflowsRequestHandlerContext,
  WorkflowsServerPluginSetup,
  WorkflowsServerPluginSetupDeps,
  WorkflowsServerPluginStart,
  WorkflowsServerPluginStartDeps,
} from './types';
import { registerUISettings } from './ui_settings';
import { stepSchemas } from '../common/step_schemas';

export class WorkflowsPlugin
  implements
    Plugin<
      WorkflowsServerPluginSetup,
      WorkflowsServerPluginStart,
      WorkflowsServerPluginSetupDeps,
      WorkflowsServerPluginStartDeps
    >
{
  private readonly logger: Logger;
  private config: WorkflowsManagementConfig;
  private readonly kibanaVersion: string;
  private availabilityUpdater: AvailabilityUpdater | null = null;
  private api: WorkflowsManagementApi | null = null;
  private workflowsService: WorkflowsService | null = null;
  private canEncryptInboundWebhooks = false;
  private inboundWebhookApiKeyService?: InboundWebhookApiKeyService;
  private inboundWebhookMappingRepository?: InboundWebhookMappingRepository;
  private readonly inboundWebhookRequestStore = new InboundWebhookRequestStore();

  constructor(initializerContext: PluginInitializerContext<WorkflowsManagementConfig>) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<WorkflowsManagementConfig>();
    this.kibanaVersion = initializerContext.env.packageInfo.version;
  }

  public setup(
    core: CoreSetup<WorkflowsServerPluginStartDeps>,
    plugins: WorkflowsServerPluginSetupDeps
  ) {
    this.logger.debug('Workflows Management: Setup');

    registerUISettings(core, plugins);

    registerTriggerDefinitions(plugins.workflowsExtensions);

    plugins.features?.registerKibanaFeature(WorkflowsManagementFeatureConfig);

    this.logger.debug('Workflows Management: Creating workflows service');

    const workflowsService = new WorkflowsService(core, plugins, this.logger, this.kibanaVersion);
    this.workflowsService = workflowsService;

    const api = new WorkflowsManagementApi(workflowsService, this.config.available);
    this.api = api;

    core.savedObjects.registerType(inboundWebhookSavedObjectType);
    if (plugins.encryptedSavedObjects) {
      this.canEncryptInboundWebhooks = plugins.encryptedSavedObjects.canEncrypt;
      plugins.encryptedSavedObjects.registerType({
        type: INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
        enforceRandomId: false,
        attributesToEncrypt: new Set(['payload']),
      });
    }
    if (plugins.taskManager) {
      registerInboundWebhookCleanupTask({
        taskManager: plugins.taskManager,
        getApiKeyService: () => this.getInboundWebhookApiKeyService(),
        getMappingRepository: () => this.getInboundWebhookMappingRepository(),
      });
    }

    if (plugins.actions) {
      plugins.actions.registerType(getWorkflowsConnectorType(api));
      plugins.actions.registerType(
        getInboundWebhookConnectorType({
          canEncrypt: () => this.canEncryptInboundWebhooks,
          emitEvent: async (request, triggerId, event) => {
            const [, startPlugins] = await core.getStartServices();
            const workflowsClient = await startPlugins.workflowsExtensions.getClient(request);
            await workflowsClient.emitEvent(triggerId, event);
          },
          getApiKeyService: () => this.getInboundWebhookApiKeyService(),
          getMappingRepository: () => this.getInboundWebhookMappingRepository(),
          getSavedObjectsClient: async (request) => {
            const [coreStart] = await core.getStartServices();
            return coreStart.savedObjects.getScopedClient(request, {
              includedHiddenTypes: [INBOUND_WEBHOOK_SAVED_OBJECT_TYPE],
              excludedExtensions: [SECURITY_EXTENSION_ID],
            });
          },
          getSpaceId: (request) => plugins.spaces.spacesService.getSpaceId(request),
          namespaceToSpaceId: (namespace) =>
            plugins.spaces.spacesService.namespaceToSpaceId(namespace),
          takeRequest: (eventId) => this.inboundWebhookRequestStore.take(eventId),
        })
      );

      if (plugins.alerting) {
        plugins.alerting.registerConnectorAdapter(getWorkflowsConnectorAdapter());
      }
    }

    plugins.workflowsExtensions.registerWorkflowsClientProvider(
      createWorkflowsClientProvider(workflowsService, this.config, this.logger)
    );
    plugins.workflowsExtensions.registerManagedWorkflowsSystemApiProvider(
      createManagedWorkflowsSystemApiProvider(workflowsService, this.config, this.logger)
    );

    const spaces = plugins.spaces.spacesService;

    const router = core.http.createRouter<WorkflowsRequestHandlerContext>();
    const audit = new WorkflowManagementAuditLog({ service: workflowsService });

    registerPostInboundWebhookRoute({
      router,
      getActionsClient: async (request, spaceId) => {
        const [, startPlugins] = await core.getStartServices();
        return startPlugins.actions.getActionsClientWithRequestInSpace(request, spaceId);
      },
      getApiKeyService: () => this.getInboundWebhookApiKeyService(),
      getMappingRepository: () => this.getInboundWebhookMappingRepository(),
      getSpaceId: (request) => plugins.spaces.spacesService.getSpaceId(request),
      logger: this.logger.get('inboundWebhookRoute'),
      requestStore: this.inboundWebhookRequestStore,
    });
    registerGetInboundWebhookStatusRoute({
      router,
      getMappingRepository: () => this.getInboundWebhookMappingRepository(),
      getSpaceId: (request) => plugins.spaces.spacesService.getSpaceId(request),
    });
    defineRoutes({
      router,
      config: this.config,
      logger: this.logger,
      api,
      spaces,
      workflowsService,
      audit,
    });

    if (plugins.inbox) {
      this.logger.debug('Workflows Management: registering inbox provider');
      plugins.inbox.registerActionProvider(
        createWorkflowsInboxProvider({ api, logger: this.logger, audit })
      );
    }

    return {
      management: api,
    };
  }

  public start(core: CoreStart, plugins: WorkflowsServerPluginStartDeps) {
    this.logger.debug('Workflows Management: Start');

    if (plugins.encryptedSavedObjects) {
      this.inboundWebhookApiKeyService = new InboundWebhookApiKeyService(
        core.security,
        this.logger.get('inboundWebhookApiKey')
      );
      this.inboundWebhookMappingRepository = new InboundWebhookMappingRepository(
        core.savedObjects.createInternalRepository([INBOUND_WEBHOOK_SAVED_OBJECT_TYPE]),
        plugins.encryptedSavedObjects.getClient({
          includedHiddenTypes: [INBOUND_WEBHOOK_SAVED_OBJECT_TYPE],
        }),
        (spaceId) => plugins.spaces.spacesService.spaceIdToNamespace(spaceId)
      );
      void scheduleInboundWebhookCleanupTask(plugins.taskManager).catch((error) => {
        this.logger.warn('Failed to schedule inbound webhook cleanup task', { error });
      });
    }

    stepSchemas.initialize(plugins.workflowsExtensions);

    if (this.api) {
      this.availabilityUpdater = new AvailabilityUpdater({
        licensing: plugins.licensing,
        config: this.config,
        api: this.api,
        logger: this.logger,
      });
    }

    if (this.workflowsService) {
      // Managed workflow owners register through workflows_extensions because owner
      // plugins cannot depend on workflows_management. Pass the setup-time owner
      // snapshot into workflows_management for storage reconciliation.
      const registeredOwnerPluginIds = plugins.workflowsExtensions.getManagedWorkflowPluginIds();
      // Safe to run in the background: this cleanup only removes docs for owners
      // missing from the setup-time registry, so it cannot race valid start installs.
      void this.runGlobalOrphanCleanup(registeredOwnerPluginIds);
    }

    this.logger.debug('Workflows Management: Started');

    return {};
  }

  private async runGlobalOrphanCleanup(registeredOwnerPluginIds: string[]): Promise<void> {
    try {
      await this.workflowsService?.cleanupUnregisteredOrphans(registeredOwnerPluginIds);
    } catch (error) {
      this.logger.warn(
        'Workflows Management: Failed to complete global orphan cleanup for unregistered workflows',
        { error }
      );
    }
  }

  public stop() {
    this.availabilityUpdater?.stop();
  }

  private getInboundWebhookApiKeyService(): InboundWebhookApiKeyService {
    if (!this.inboundWebhookApiKeyService) {
      throw new Error('Inbound webhook API key service is unavailable');
    }
    return this.inboundWebhookApiKeyService;
  }

  private getInboundWebhookMappingRepository(): InboundWebhookMappingRepository {
    if (!this.inboundWebhookMappingRepository) {
      throw new Error('Inbound webhook mapping repository is unavailable');
    }
    return this.inboundWebhookMappingRepository;
  }
}
