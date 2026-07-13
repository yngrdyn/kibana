/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorMetadata } from './connector_spec';

jest.mock('./all_specs', () => {
  const { inboundWebhookReceivedEventSchema } = jest.requireActual(
    './inbound_webhook_received_event_schema'
  );
  const { defineConnectorEvent: defineEvent } = jest.requireActual('./define_connector_event');

  const inboundWebhookMetadata: ConnectorMetadata = {
    id: '.inboundWebhook',
    displayName: 'Inbound Webhook',
    description: 'Receive HTTP requests from external systems',
    minimumLicense: 'gold',
    supportedFeatureIds: ['workflows'],
  };

  return {
    exampleInboundWebhook: {
      metadata: inboundWebhookMetadata,
      actions: {},
      events: {
        definitions: {
          received: defineEvent({
            eventId: 'inboundWebhook.received',
            title: 'Webhook received',
            description: 'Fires when an authenticated request hits this connector endpoint.',
            eventSchema: inboundWebhookReceivedEventSchema,
          }),
        },
        handleEvents: async () => ({ events: [] }),
      },
    },
  };
});

import { resolveRegisteredConnectorEventByEventId } from './resolve_registered_connector_event_by_event_id';

describe('resolveRegisteredConnectorEventByEventId', () => {
  it('resolves a registered connector event by eventId', () => {
    const event = resolveRegisteredConnectorEventByEventId('inboundWebhook.received');

    expect(event).toMatchObject({
      eventId: 'inboundWebhook.received',
      eventKey: 'received',
      connectorTypeId: '.inboundWebhook',
      title: 'Webhook received',
    });
  });

  it('returns undefined when no connector spec declares the eventId', () => {
    expect(resolveRegisteredConnectorEventByEventId('unknown.event')).toBeUndefined();
  });
});
