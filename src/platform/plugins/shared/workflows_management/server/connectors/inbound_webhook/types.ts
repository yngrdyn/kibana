/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface InboundWebhookConfig extends Record<string, unknown> {
  webhookKey: string;
  webhookKeyHash: string;
  credentialRevision: string;
}

export type InboundWebhookSecrets = Record<string, never>;

export interface ReceiveWebhookSubActionParams {
  eventId: string;
  credentialRevision: string;
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  receivedAt: string;
}

export interface InboundWebhookEvent extends Record<string, unknown> {
  connectorId: string;
  eventId: string;
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  receivedAt: string;
}

export interface InboundWebhookParams extends Record<string, unknown> {
  subAction: 'receive';
  subActionParams: ReceiveWebhookSubActionParams;
}

export interface InboundWebhookResult {
  eventId: string;
  accepted: true;
}
