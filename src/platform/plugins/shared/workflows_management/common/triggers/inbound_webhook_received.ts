/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID } from '../inbound_webhook/constants';

export const inboundWebhookReceivedEventSchema = z.object({
  connectorId: z.string().describe('Saved connector instance id that received the webhook.'),
  eventId: z.string().describe('Unique id assigned when the webhook was accepted.'),
  body: z.record(z.string(), z.unknown()).describe('Parsed JSON request body.'),
  query: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .describe('URL query parameters.'),
  headers: z.record(z.string(), z.string()).describe('Allowed request headers.'),
  receivedAt: z.string().describe('ISO timestamp when the event was received.'),
});

export type InboundWebhookReceivedEvent = z.infer<typeof inboundWebhookReceivedEventSchema>;

export const commonInboundWebhookReceivedTriggerDefinition: CommonTriggerDefinition = {
  id: INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID,
  stability: 'tech_preview',
  eventSchema: inboundWebhookReceivedEventSchema,
  title: i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerTitle', {
    defaultMessage: 'Webhook received',
  }),
  description: i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerDescription', {
    defaultMessage: 'When an HTTP request is received on the inbound webhook endpoint.',
  }),
  documentation: {
    details: i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerDocumentation', {
      defaultMessage:
        'Subscribe to a specific inbound webhook connector instance. Filter when this workflow runs using KQL on event properties (e.g. event.body.severity).',
    }),
    examples: [
      i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerExample', {
        defaultMessage: `## Match by body field
\`\`\`yaml
triggers:
  - type: ${INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID}
    connector-id: my-webhook
    on:
      condition: 'event.body.severity: "critical"'
\`\`\``,
      }),
    ],
  },
  snippets: {
    condition: 'event.body.severity: "critical"',
  },
};
