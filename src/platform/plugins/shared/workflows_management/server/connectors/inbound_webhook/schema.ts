/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

export const InboundWebhookConfigSchema = z.object({
  webhookKey: z.string().regex(/^[a-f0-9]{32}$/),
  webhookKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  credentialRevision: z.string().uuid(),
});

export const InboundWebhookSecretsSchema = z.object({}).strict();

export const ReceiveWebhookSubActionParamsSchema = z.object({
  eventId: z.string().uuid(),
  credentialRevision: z.string().uuid(),
  body: z.record(z.string(), z.unknown()),
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  headers: z.record(z.string(), z.string()),
  receivedAt: z.string().datetime(),
});

export const InboundWebhookParamsSchema = z.object({
  subAction: z.literal('receive'),
  subActionParams: ReceiveWebhookSubActionParamsSchema,
});
