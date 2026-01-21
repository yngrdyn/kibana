/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { TriggerRegistry } from './trigger_registry';

/**
 * Event document structure for PoC
 */
export interface WorkflowEvent {
  id: string;
  triggerType: string;
  payload: Record<string, any>;
  spaceId: string;
  timestamp: string;
  credentialRef: {
    type: 'user' | 'api_key' | 'service';
    principalId: string;
    apiKeyId?: string; // API key ID for workflow execution (created when event is emitted)
  };
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
  processingStartedAt?: string; // Timestamp when event was claimed (moved to PROCESSING status)
}

/**
 * Parameters for event emission
 */
export interface EmitEventParams {
  triggerType: string;
  payload: Record<string, any>;
  kibanaRequest: KibanaRequest;
}

/**
 * Result of event emission
 */
export interface EmitEventResult {
  eventId: string;
}

/**
 * Options for event emission service
 */
export interface EmitEventOptions {
  triggerRegistry: TriggerRegistry;
  esClient: ElasticsearchClient;
  spaces?: SpacesPluginStart;
  logger: Logger;
  indexName: string;
  security?: {
    authc: {
      apiKeys?: {
        grantAsInternalUser: (
          request: KibanaRequest,
          params: { name: string; role_descriptors?: Record<string, any>; metadata?: Record<string, any> }
        ) => Promise<{ id: string; api_key: string } | null>;
      };
      getCurrentUser: (request: KibanaRequest) => { username: string } | null;
    };
  };
  encryptedSavedObjects?: {
    getClient: (options?: { includedHiddenTypes?: string[] }) => {
      create: (type: string, attributes: any, options?: { id?: string; namespace?: string }) => Promise<any>;
      getDecryptedAsInternalUser: <T = any>(type: string, id: string, options?: { namespace?: string }) => Promise<{ attributes: T }>;
    };
  };
  savedObjects?: {
    getScopedClient: (request: KibanaRequest, options?: { excludedExtensions?: string[]; includedHiddenTypes?: string[] }) => {
      create: (type: string, attributes: any, options?: { id?: string; namespace?: string }) => Promise<any>;
    };
  };
}

/**
 * Emit an event into the event store.
 * Validates the trigger exists and payload matches schema, then persists to Elasticsearch.
 */
export async function emitEvent(
  params: EmitEventParams,
  options: EmitEventOptions
): Promise<EmitEventResult> {
  const { triggerType, payload, kibanaRequest } = params;
  const { triggerRegistry, esClient, spaces, logger, indexName } = options;

  const trigger = triggerRegistry.getTrigger(triggerType);
  if (!trigger) {
    throw new Error(`Unknown trigger type: ${triggerType}`);
  }

  try {
    trigger.eventSchema.parse(payload);
  } catch (error) {
    throw new Error(`Payload validation failed for trigger ${triggerType}: ${error.message}`);
  }

  const spaceId = spaces?.spacesService?.getSpaceId(kibanaRequest) ?? 'default';

  const auth = kibanaRequest.auth;
  const isAuthenticated = auth.isAuthenticated === true;
  const credentials = (auth as any).credentials;
  
  let principalId = 'system';
  if (options.security?.authc?.getCurrentUser) {
    try {
      const currentUser = options.security.authc.getCurrentUser(kibanaRequest);
      if (currentUser?.username) {
        principalId = currentUser.username;
      }
    } catch (error) {
      logger.debug(`Failed to get current user from security service: ${error}`);
    }
  }
  
  if (principalId === 'system' && isAuthenticated && credentials) {
    principalId = credentials.username || credentials.appName || 'system';
  }
  
  const credentialRef = {
    type: (isAuthenticated && credentials?.type === 'api_key' ? 'api_key' : 'user') as
      | 'user'
      | 'api_key'
      | 'service',
    principalId,
  };

  logger.debug(
    `Event emission auth check: isAuthenticated=${isAuthenticated}, hasSecurity=${!!options.security?.authc?.apiKeys}, hasEncryptedSO=${!!options.encryptedSavedObjects}, hasSavedObjects=${!!options.savedObjects}`
  );

  const eventId = uuidv4();

  // 6. Create API key for workflow execution (if security service is available)
  // This API key will be used when executing workflows triggered by this event
  // Store the API key value in EncryptedSavedObjects and only store the ID in credentialRef
  let apiKeyId: string | undefined;
  
  const canCreateApiKey =
    options.security?.authc?.apiKeys?.grantAsInternalUser &&
    options.encryptedSavedObjects &&
    options.savedObjects &&
    isAuthenticated;
  
  if (!canCreateApiKey) {
    logger.warn(
      `Cannot create API key for event: security=${!!options.security?.authc?.apiKeys}, encryptedSavedObjects=${!!options.encryptedSavedObjects}, savedObjects=${!!options.savedObjects}, isAuthenticated=${isAuthenticated}`
    );
  }
  
  if (canCreateApiKey && options.security?.authc?.apiKeys) {
    try {
      const apiKeyResult = await options.security.authc.apiKeys.grantAsInternalUser(kibanaRequest, {
        name: `Event-driven workflow execution - ${triggerType}`,
        role_descriptors: {},
        metadata: {
          managed: true,
          event_driven_workflow: true,
          triggerType,
          eventSpaceId: spaceId,
        },
      });

      if (apiKeyResult) {
        const { id, api_key } = apiKeyResult;
        apiKeyId = id;

        if (options.savedObjects) {
          const soClient = options.savedObjects.getScopedClient(kibanaRequest, {
            includedHiddenTypes: ['workflow-event-api-key'],
          });

          await soClient.create(
            'workflow-event-api-key',
            {
              apiKey: api_key,
              apiKeyId: id,
              eventId,
              triggerType,
              spaceId,
            },
            {
              id: eventId,
              namespace: spaceId !== 'default' ? spaceId : undefined,
            }
          );

          logger.debug(`Created and stored API key for event execution: ${id} (event: ${eventId})`);
        } else {
          logger.warn(`SavedObjects not available, cannot store API key for event ${eventId}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to create API key for event execution: ${error}. Workflow execution may fail without authentication.`);
    }
  }

  const event: WorkflowEvent = {
    id: eventId,
    triggerType,
    payload,
    spaceId,
    timestamp: new Date().toISOString(),
    credentialRef: {
      ...credentialRef,
      ...(apiKeyId && { apiKeyId }), // Store only the ID in credentialRef
    },
    status: 'PENDING',
  };

  try {
    await esClient.index({
      index: indexName,
      id: eventId,
      refresh: false,
      document: event,
    });

    logger.debug(`Event emitted: ${eventId} (trigger: ${triggerType}, space: ${spaceId})`);

    return { eventId };
  } catch (error) {
    logger.error(`Failed to persist event ${eventId}: ${error}`);
    throw error;
  }
}
