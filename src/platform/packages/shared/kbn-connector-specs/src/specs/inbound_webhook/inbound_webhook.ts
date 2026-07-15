/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';

import type { ConnectorSpec } from '../../connector_spec';
import { defineConnectorEvent } from '../../define_connector_event';
import { buildConnectorEventId } from '../../connector_event_type_id';
import { inboundWebhookReceivedEventSchema } from '../../inbound_webhook_received_event_schema';
import {
  INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
  INBOUND_WEBHOOK_RECEIVED_EVENT_KEY,
} from '../../inbound_webhook_constants';
import { filterInboundHeaders } from '../../inbound_webhook/filter_inbound_headers';

export const InboundWebhookConnector: ConnectorSpec = {
  metadata: {
    id: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
    displayName: 'Inbound Webhook',
    description: i18n.translate('core.kibanaConnectorSpecs.inboundWebhook.metadata.description', {
      defaultMessage: 'Receive HTTP requests from external systems and trigger workflows.',
    }),
    minimumLicense: 'gold',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows'],
  },

  auth: {
    types: ['none'],
  },

  schema: lazySchema(() =>
    z.object({
      ingestTokenHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional()
        .meta({
          hidden: true,
          label: i18n.translate('core.kibanaConnectorSpecs.inboundWebhook.config.ingestTokenHash', {
            defaultMessage: 'Ingest token hash',
          }),
        }),
      webhookUrl: z
        .string()
        .url()
        .optional()
        .meta({
          hidden: true,
          label: i18n.translate('core.kibanaConnectorSpecs.inboundWebhook.config.webhookUrl', {
            defaultMessage: 'Webhook URL',
          }),
        }),
      delegatedApiKeyId: z
        .string()
        .optional()
        .meta({
          hidden: true,
          label: i18n.translate(
            'core.kibanaConnectorSpecs.inboundWebhook.config.delegatedApiKeyId',
            {
              defaultMessage: 'Delegated API key id',
            }
          ),
        }),
      delegatedUiamApiKeyId: z
        .string()
        .optional()
        .meta({
          hidden: true,
          label: i18n.translate(
            'core.kibanaConnectorSpecs.inboundWebhook.config.delegatedUiamApiKeyId',
            {
              defaultMessage: 'Delegated UIAM API key id',
            }
          ),
        }),
    })
  ),

  actions: {},

  events: {
    definitions: {
      [INBOUND_WEBHOOK_RECEIVED_EVENT_KEY]: defineConnectorEvent({
        eventId: buildConnectorEventId(
          INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
          INBOUND_WEBHOOK_RECEIVED_EVENT_KEY
        ),
        title: i18n.translate('core.kibanaConnectorSpecs.inboundWebhook.events.received.title', {
          defaultMessage: 'Webhook received',
        }),
        description: i18n.translate(
          'core.kibanaConnectorSpecs.inboundWebhook.events.received.description',
          {
            defaultMessage: 'Fires when an authenticated request hits this connector endpoint.',
          }
        ),
        eventSchema: inboundWebhookReceivedEventSchema,
        stability: 'tech_preview',
      }),
    },

    async handleEvents(ctx) {
      const receivedAt = new Date().toISOString();
      const query = normalizeQuery(ctx.headers);
      return {
        events: [
          {
            eventId: buildConnectorEventId(
              INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
              INBOUND_WEBHOOK_RECEIVED_EVENT_KEY
            ),
            correlationKey: uuidv4(),
            payload: {
              body: ctx.rawBody,
              headers: filterInboundHeaders(ctx.headers),
              ...(query ? { query } : {}),
              receivedAt,
            },
          },
        ],
      };
    },
  },

  test: {
    enabled: false,
    handler: async () => ({}),
  },
};

const normalizeQuery = (
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[]> | undefined => {
  const rawQuery = headers['x-inbound-query'];
  if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(rawQuery);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, string | string[]>;
  } catch {
    return undefined;
  }
};
