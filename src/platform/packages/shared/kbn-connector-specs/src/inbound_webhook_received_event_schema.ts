/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

/**
 * Payload shape for inbound webhook `received` connector events.
 * Hub adds `connectorId` and `connectorTypeId` before emit; handleEvents supplies the rest.
 */
export const inboundWebhookReceivedEventSchema = z.object({
  connectorId: z.string().describe('Saved connector instance id.'),
  connectorTypeId: z.string().describe('Connector type id (e.g. .inboundWebhook).'),
  body: z.unknown().describe('Parsed request body.'),
  headers: z
    .record(z.string(), z.string())
    .describe('Non-sensitive request headers forwarded with the event.'),
  query: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe('Query string parameters from the inbound request.'),
  receivedAt: z.string().describe('ISO timestamp when the event was received.'),
  correlationKey: z
    .string()
    .optional()
    .describe('Idempotency / deduplication key for this ingress request.'),
});
