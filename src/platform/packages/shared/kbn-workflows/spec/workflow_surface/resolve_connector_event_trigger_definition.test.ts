/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { defineConnectorEvent, toRegisteredConnectorEvent } from '@kbn/connector-specs';
import type { ConnectorMetadata } from '@kbn/connector-specs';
import { z } from '@kbn/zod/v4';

const inboundWebhookMetadata: ConnectorMetadata = {
  id: '.inboundWebhook',
  displayName: 'Inbound Webhook',
  description: 'Receive HTTP requests from external systems',
  minimumLicense: 'gold',
  supportedFeatureIds: ['workflows'],
};

const mockInboundWebhookReceivedEventSchema = z.object({
  connectorId: z.string(),
  body: z.unknown(),
});

const mockInboundWebhookReceivedEvent = toRegisteredConnectorEvent(
  inboundWebhookMetadata,
  'received',
  defineConnectorEvent({
    eventId: 'inboundWebhook.received',
    title: 'Webhook received',
    description: 'Fires when an authenticated request hits this connector endpoint.',
    eventSchema: mockInboundWebhookReceivedEventSchema,
  })
);

jest.mock('@kbn/connector-specs/server', () => {
  const actual = jest.requireActual('@kbn/connector-specs/server');
  return {
    ...actual,
    resolveRegisteredConnectorEventByEventId: jest.fn((eventId: string) =>
      eventId === 'inboundWebhook.received' ? mockInboundWebhookReceivedEvent : undefined
    ),
  };
});

import { resolveConnectorEventTriggerDefinition } from './resolve_connector_event_trigger_definition';

describe('resolveConnectorEventTriggerDefinition', () => {
  it('returns a trigger definition derived from the connector spec event', () => {
    const definition = resolveConnectorEventTriggerDefinition('inboundWebhook.received');

    expect(definition).toMatchObject({
      id: 'inboundWebhook.received',
      title: 'Webhook received',
      stability: 'tech_preview',
      eventSchema: mockInboundWebhookReceivedEventSchema,
    });
  });

  it('returns undefined when the eventId is not declared on any connector spec', () => {
    expect(resolveConnectorEventTriggerDefinition('unknown.event')).toBeUndefined();
  });
});
