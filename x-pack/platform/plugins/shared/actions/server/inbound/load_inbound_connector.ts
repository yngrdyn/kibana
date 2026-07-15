/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { getConnectorSpec, normalizeConnectorTypeId } from '@kbn/connector-specs';

import type { ActionTypeRegistry, InMemoryConnector, RawAction } from '../types';
import { ACTION_SAVED_OBJECT_TYPE } from '../constants/saved_objects';
import { validateSecrets } from '../lib';

export interface LoadedInboundConnector {
  connectorId: string;
  connectorTypeId: string;
  spaceId: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
}

export async function loadInboundConnector({
  connectorId,
  connectorTypeId,
  spaceId,
  encryptedSavedObjectsClient,
  unsecuredSavedObjectsClient,
  inMemoryConnectors,
  actionTypeRegistry,
  isESOCanEncrypt,
  logger,
}: {
  connectorId: string;
  connectorTypeId: string;
  spaceId: string;
  encryptedSavedObjectsClient?: EncryptedSavedObjectsClient;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  inMemoryConnectors: InMemoryConnector[];
  actionTypeRegistry: ActionTypeRegistry;
  isESOCanEncrypt: boolean;
  logger: Logger;
}): Promise<LoadedInboundConnector | undefined> {
  const normalizedTypeId = normalizeConnectorTypeId(connectorTypeId);
  const spec = getConnectorSpec(normalizedTypeId);
  if (!spec?.events) {
    return undefined;
  }

  const inMemoryConnector = inMemoryConnectors.find((connector) => connector.id === connectorId);
  let actionTypeId: string | undefined;
  let config: Record<string, unknown> = {};
  let secrets: Record<string, unknown> = {};

  if (inMemoryConnector) {
    actionTypeId = inMemoryConnector.actionTypeId;
    config = inMemoryConnector.config ?? {};
    secrets = inMemoryConnector.secrets ?? {};
  } else {
    try {
      const { attributes } = await unsecuredSavedObjectsClient.get<RawAction>(
        ACTION_SAVED_OBJECT_TYPE,
        connectorId
      );
      actionTypeId = attributes.actionTypeId;
      config = attributes.config ?? {};

      if (!isESOCanEncrypt || !encryptedSavedObjectsClient) {
        logger.warn('Inbound connector ingress requires encrypted saved objects');
        return undefined;
      }

      const decrypted = await encryptedSavedObjectsClient.getDecryptedAsInternalUser<RawAction>(
        ACTION_SAVED_OBJECT_TYPE,
        connectorId,
        spaceId !== 'default' ? { namespace: spaceId } : {}
      );
      secrets = decrypted.attributes.secrets ?? {};
    } catch (error) {
      logger.debug(`Failed to load inbound connector ${connectorId}: ${String(error)}`);
      return undefined;
    }
  }

  if (actionTypeId !== normalizedTypeId) {
    return undefined;
  }

  const actionType = actionTypeRegistry.get(actionTypeId);
  const configurationUtilities = actionTypeRegistry.getUtils();
  const validatedSecrets = validateSecrets(actionType, secrets, { configurationUtilities });

  return {
    connectorId,
    connectorTypeId: normalizedTypeId,
    spaceId,
    config,
    secrets: validatedSecrets,
  };
}
