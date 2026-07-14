/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsType } from '@kbn/core/server';

export const INBOUND_WEBHOOK_SAVED_OBJECT_TYPE = 'workflow_inbound_webhook' as const;

export interface InboundWebhookCredentialSecrets {
  apiKey: string;
  credentialVersion: number;
  uiamApiKey?: string;
  webhookUrl?: string;
}

export interface InboundWebhookPayload {
  connectorId: string;
  connectorTypeId: '.workflows-inbound-webhook';
  status: 'pending' | 'active';
  targetWebhookKeyHash: string;
  credentialRevision: string;
  apiKeyId: string;
  uiamApiKeyId?: string;
  delegatedUsername?: string;
  delegatedUserProfileId?: string;
  createdAt: string;
  updatedAt: string;
  secrets: InboundWebhookCredentialSecrets;
}

export interface InboundWebhookSavedObject {
  payload: InboundWebhookPayload;
}

export const inboundWebhookSavedObjectType: SavedObjectsType = {
  name: INBOUND_WEBHOOK_SAVED_OBJECT_TYPE,
  hidden: true,
  namespaceType: 'multiple-isolated',
  mappings: {
    dynamic: false,
    properties: {
      payload: { type: 'binary' },
    },
  },
  management: {
    importableAndExportable: false,
  },
};
