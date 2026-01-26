/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { ConnectorsPluginsStart } from '../plugin';
import { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';

/**
 * Creates and stores an API key for a connector to use for external event-driven workflows.
 * 
 * This API key is created with the user's authentication context (from the request),
 * so workflows triggered by external events will execute with the connector creator's permissions.
 * 
 * The API key is stored in EncryptedSavedObjects and can be retrieved later when events arrive.
 * 
 * This function is designed to be called from connector postSaveHook, which has access to
 * the request (with user context) but needs to get services via getStartServices.
 * 
 * @param params - Parameters for creating the connector API key
 * @returns The created API key ID, or null if creation failed
 */
export async function createConnectorApiKeyForExternalEvents({
  connectorId,
  connectorTypeId,
  request,
  getStartServices,
  logger,
}: {
  connectorId: string;
  connectorTypeId: string;
  request: KibanaRequest;
  getStartServices: StartServicesAccessor<ConnectorsPluginsStart, unknown>;
  logger: Logger;
}): Promise<{ apiKeyId: string; apiKey: string } | null> {
  // Get services we need
  const [coreStart, pluginsStart] = await getStartServices();
  const { encryptedSavedObjects, spaces } = pluginsStart;
  
  const spaceId = spaces?.spacesService?.getSpaceId(request) ?? 'default';
  
  // Check if security service and API key creation are available
  // Use CoreStart.security which is always available (unlike SecurityPluginStart)
  if (!coreStart.security?.authc?.apiKeys?.grantAsInternalUser) {
    logger.warn(
      `Security service or API key creation not available for connector ${connectorId}. ` +
      `Cannot create API key for external events.`
    );
    return null;
  }

  // Check if API keys are enabled
  if (!(await coreStart.security.authc.apiKeys.areAPIKeysEnabled())) {
    logger.warn(
      `API keys are not enabled for connector ${connectorId}. ` +
      `Cannot create API key for external events.`
    );
    return null;
  }

  if (!encryptedSavedObjects) {
    logger.warn(
      `EncryptedSavedObjects not available for connector ${connectorId}. ` +
      `Cannot store API key for external events.`
    );
    return null;
  }

  try {
    // Create an API key using the user's authentication context from the request
    // This ensures workflows execute with the connector creator's permissions
    const apiKeyResult = await coreStart.security.authc.apiKeys.grantAsInternalUser(request, {
      name: `External events workflow execution - ${connectorTypeId} connector ${connectorId}`,
      role_descriptors: {}, // Empty role descriptors means it inherits the user's roles
      metadata: {
        managed: true,
        event_driven_workflow: true,
        connectorId,
        connectorTypeId,
        eventSpaceId: spaceId,
      },
      expiration: '90d', // Long expiration since this is reused across events
    });

    if (!apiKeyResult || !apiKeyResult.id || !apiKeyResult.api_key) {
      logger.warn(`API key creation returned null or incomplete result for connector ${connectorId}`);
      return null;
    }

    // Store the API key in EncryptedSavedObjects for later retrieval
    // Note: We cannot use predefined IDs with EncryptedSavedObjects unless they're UUIDs
    // So we let Elasticsearch generate the ID and query by connectorId attribute instead
    const soClient = coreStart.savedObjects.getScopedClient(request, {
      includedHiddenTypes: ['workflow-connector-api-key'],
    });

    try {
      // First, check if an API key already exists for this connector and delete it
      const existingApiKeys = await soClient.find<{
        apiKey: string;
        apiKeyId: string;
        connectorId: string;
        spaceId: string;
      }>({
        type: 'workflow-connector-api-key',
        filter: `workflow-connector-api-key.attributes.connectorId: "${connectorId}"`,
        perPage: 1,
        namespaces: spaceId !== 'default' ? [spaceId] : undefined,
      });

      // Delete existing API keys for this connector (if any)
      if (existingApiKeys.saved_objects.length > 0) {
        await Promise.all(
          existingApiKeys.saved_objects.map((so) =>
            soClient.delete('workflow-connector-api-key', so.id, {
              namespace: spaceId !== 'default' ? spaceId : undefined,
            })
          )
        );
      }

      // Create new API key (let Elasticsearch generate the ID)
      await soClient.create(
        'workflow-connector-api-key',
        {
          apiKey: apiKeyResult.api_key,
          apiKeyId: apiKeyResult.id,
          connectorId,
          spaceId,
        },
        {
          namespace: spaceId !== 'default' ? spaceId : undefined,
        }
      );

      logger.info(
        `Created and stored API key ${apiKeyResult.id} for connector ${connectorId} (type: ${connectorTypeId})`
      );

      return {
        apiKeyId: apiKeyResult.id,
        apiKey: apiKeyResult.api_key,
      };
    } catch (storeError) {
      logger.error(
        `Failed to store API key for connector ${connectorId}: ${storeError instanceof Error ? storeError.message : String(storeError)}`
      );
      // Invalidate the API key since we couldn't store it
      try {
        await coreStart.security.authc.apiKeys.invalidate(request, { ids: [apiKeyResult.id] });
      } catch (invalidateError) {
        logger.warn(
          `Failed to invalidate API key ${apiKeyResult.id} after storage failure: ${invalidateError instanceof Error ? invalidateError.message : String(invalidateError)}`
        );
      }
      return null;
    }
  } catch (error) {
    logger.error(
      `Failed to create API key for connector ${connectorId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Retrieves the stored API key for a connector.
 * 
 * @param params - Parameters for retrieving the connector API key
 * @returns The stored API key, or null if not found
 */
export async function getConnectorApiKeyForExternalEvents({
  connectorId,
  spaceId,
  encryptedSavedObjects,
  logger,
}: {
  connectorId: string;
  spaceId: string;
  encryptedSavedObjects?: EncryptedSavedObjectsPluginStart;
  logger: Logger;
}): Promise<{ apiKeyId: string; apiKey: string } | null> {
  if (!encryptedSavedObjects) {
    return null;
  }

  const encryptedClient = encryptedSavedObjects.getClient({
    includedHiddenTypes: ['workflow-connector-api-key'],
  });

  try {
    // Query by connectorId attribute since we can't use predefined IDs
    // Use point-in-time finder to get decrypted results
    const finder = await encryptedClient.createPointInTimeFinderDecryptedAsInternalUser<{
      apiKey: string;
      apiKeyId: string;
      connectorId: string;
      spaceId: string;
    }>({
      type: 'workflow-connector-api-key',
      filter: `workflow-connector-api-key.attributes.connectorId: "${connectorId}"`,
      perPage: 1,
      namespaces: spaceId !== 'default' ? [spaceId] : undefined,
    });

    try {
      // Get the first result (we only expect one API key per connector)
      for await (const result of finder.find()) {
        if (result.saved_objects.length > 0) {
          const storedApiKey = result.saved_objects[0];
          if (storedApiKey?.attributes?.apiKey && storedApiKey?.attributes?.apiKeyId) {
            return {
              apiKeyId: storedApiKey.attributes.apiKeyId,
              apiKey: storedApiKey.attributes.apiKey,
            };
          }
        }
        // Only need first page
        break;
      }
      return null;
    } finally {
      await finder.close();
    }
  } catch (error) {
    logger.warn(
      `Failed to retrieve API key for connector ${connectorId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
