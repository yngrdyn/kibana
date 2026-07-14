/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ISavedObjectsRepository,
  SavedObject,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type {
  InboundWebhookPayload,
  InboundWebhookSavedObject,
} from '../saved_objects/inbound_webhook';
import { INBOUND_WEBHOOK_SAVED_OBJECT_TYPE } from '../saved_objects/inbound_webhook';

export interface StageInboundWebhookParams {
  connectorId: string;
  credentialRevision: string;
  webhookKeyHash: string;
  spaceId: string;
  attributes: Omit<
    InboundWebhookPayload,
    | 'connectorId'
    | 'connectorTypeId'
    | 'status'
    | 'targetWebhookKeyHash'
    | 'credentialRevision'
    | 'createdAt'
    | 'updatedAt'
  >;
}

interface PromoteResult {
  active: SavedObject<InboundWebhookSavedObject>;
  previous?: SavedObject<InboundWebhookSavedObject>;
}

export class InboundWebhookMappingRepository {
  constructor(
    private readonly savedObjectsRepository: ISavedObjectsRepository,
    private readonly encryptedSavedObjectsClient: EncryptedSavedObjectsClient,
    private readonly spaceIdToNamespace: (spaceId: string) => string | undefined
  ) {}

  public async stage(
    params: StageInboundWebhookParams,
    savedObjectsClient: SavedObjectsClientContract
  ): Promise<string> {
    const pendingId = this.getPendingId(params.connectorId, params.credentialRevision);
    const now = new Date().toISOString();
    await savedObjectsClient.create<InboundWebhookSavedObject>(
      INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
      {
        payload: {
          ...params.attributes,
          connectorId: params.connectorId,
          connectorTypeId: '.workflows-inbound-webhook',
          status: 'pending',
          targetWebhookKeyHash: params.webhookKeyHash,
          credentialRevision: params.credentialRevision,
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        id: pendingId,
        overwrite: true,
      }
    );
    return pendingId;
  }

  public async promote({
    pendingId,
    spaceId,
    savedObjectsClient,
  }: {
    pendingId: string;
    spaceId: string;
    savedObjectsClient: SavedObjectsClientContract;
  }): Promise<PromoteResult> {
    const namespace = this.spaceIdToNamespace(spaceId);
    const pending =
      await this.encryptedSavedObjectsClient.getDecryptedAsInternalUser<InboundWebhookSavedObject>(
        INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
        pendingId,
        { namespace }
      );
    const activeId = pending.attributes.payload.targetWebhookKeyHash;
    const previous = await this.resolve(activeId, spaceId);
    const active = await savedObjectsClient.create<InboundWebhookSavedObject>(
      INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
      {
        payload: {
          ...pending.attributes.payload,
          status: 'active',
          updatedAt: new Date().toISOString(),
        },
      },
      { id: activeId, overwrite: true }
    );
    await savedObjectsClient.delete(INBOUND_WEBHOOK_SAVED_OBJECT_TYPE, pendingId);
    return { active, previous };
  }

  public async resolve(
    webhookKeyHash: string,
    spaceId: string
  ): Promise<SavedObject<InboundWebhookSavedObject> | undefined> {
    try {
      return await this.encryptedSavedObjectsClient.getDecryptedAsInternalUser<InboundWebhookSavedObject>(
        INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
        webhookKeyHash,
        { namespace: this.spaceIdToNamespace(spaceId) }
      );
    } catch (error) {
      if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  public async deletePending(pendingId: string, spaceId: string): Promise<void> {
    await this.savedObjectsRepository.delete(INBOUND_WEBHOOK_SAVED_OBJECT_TYPE, pendingId, {
      namespace: this.spaceIdToNamespace(spaceId),
      force: true,
    });
  }

  public async getForConnector(
    connectorId: string,
    spaceId: string
  ): Promise<Array<SavedObject<InboundWebhookSavedObject>>> {
    const namespace = this.spaceIdToNamespace(spaceId);
    const finder =
      await this.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<InboundWebhookSavedObject>(
        {
          type: INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
          namespaces: [namespace ?? DEFAULT_NAMESPACE_STRING],
          perPage: 100,
        }
      );
    const results: Array<SavedObject<InboundWebhookSavedObject>> = [];
    for await (const page of finder.find()) {
      results.push(...page.saved_objects);
    }
    await finder.close();
    return results.filter(({ attributes }) => attributes.payload.connectorId === connectorId);
  }

  public async deleteForConnector(connectorId: string, spaceId: string): Promise<void> {
    const namespace = this.spaceIdToNamespace(spaceId);
    const savedObjects = await this.getForConnector(connectorId, spaceId);
    await Promise.all(
      savedObjects.map(({ id }) =>
        this.savedObjectsRepository.delete(INBOUND_WEBHOOK_SAVED_OBJECT_TYPE, id, {
          namespace,
          force: true,
        })
      )
    );
  }

  public async getPendingBefore(
    timestamp: string
  ): Promise<Array<SavedObject<InboundWebhookSavedObject>>> {
    const finder =
      await this.encryptedSavedObjectsClient.createPointInTimeFinderDecryptedAsInternalUser<InboundWebhookSavedObject>(
        {
          type: INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
          namespaces: ['*'],
          perPage: 100,
        }
      );
    const results: Array<SavedObject<InboundWebhookSavedObject>> = [];
    for await (const page of finder.find()) {
      results.push(...page.saved_objects);
    }
    await finder.close();
    return results.filter(
      ({ attributes }) =>
        attributes.payload.status === 'pending' && attributes.payload.updatedAt < timestamp
    );
  }

  public async deleteSavedObject(savedObject: SavedObject): Promise<void> {
    const namespace = savedObject.namespaces?.[0];
    await this.savedObjectsRepository.delete(INBOUND_WEBHOOK_SAVED_OBJECT_TYPE, savedObject.id, {
      namespace: namespace === DEFAULT_NAMESPACE_STRING ? undefined : namespace,
      force: true,
    });
  }

  private getPendingId(connectorId: string, credentialRevision: string): string {
    return `pending:${connectorId}:${credentialRevision}`;
  }
}
