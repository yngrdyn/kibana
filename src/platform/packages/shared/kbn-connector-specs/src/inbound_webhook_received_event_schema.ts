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
 * Describes the emitted event data; connector binding is resolved separately at ingress.
 */
export const inboundWebhookReceivedEventSchema = z.object({
  connectorId: z.string().describe('Saved connector instance id.'),
  body: z.unknown().describe('Parsed request body.'),
  receivedAt: z.string().describe('ISO timestamp when the event was received.'),
});
