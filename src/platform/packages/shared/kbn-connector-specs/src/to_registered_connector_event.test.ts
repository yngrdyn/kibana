/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { inboundWebhookReceivedEventSchema } from '..';
import type { ConnectorMetadata } from './connector_spec';
import { defineConnectorEvent } from './define_connector_event';
import {
  buildConnectorEventId,
  buildConnectorIngressEventsPath,
  connectorTypeToEventNamespace,
  normalizeConnectorTypeId,
} from './connector_event_type_id';
import { toRegisteredConnectorEvent } from './to_registered_connector_event';

const inboundWebhookMetadata: ConnectorMetadata = {
  id: '.inboundWebhook',
  displayName: 'Inbound Webhook',
  description: 'Receive HTTP requests from external systems',
  minimumLicense: 'gold',
  supportedFeatureIds: ['workflows'],
};

describe('connector event type id helpers', () => {
  it('connectorTypeToEventNamespace strips leading dot', () => {
    expect(connectorTypeToEventNamespace('.inboundWebhook')).toBe('inboundWebhook');
    expect(connectorTypeToEventNamespace('inboundWebhook')).toBe('inboundWebhook');
  });

  it('normalizeConnectorTypeId adds leading dot when missing', () => {
    expect(normalizeConnectorTypeId('inboundWebhook')).toBe('.inboundWebhook');
    expect(normalizeConnectorTypeId('.inboundWebhook')).toBe('.inboundWebhook');
  });

  it('buildConnectorIngressEventsPath builds the hub route segment', () => {
    expect(
      buildConnectorIngressEventsPath({
        connectorTypeId: '.inboundWebhook',
        connectorId: 'conn-1',
      })
    ).toBe('/api/events/v1/inboundWebhook/conn-1');
  });

  it('buildConnectorEventId follows convention', () => {
    expect(buildConnectorEventId('.inboundWebhook', 'received')).toBe('inboundWebhook.received');
  });
});

describe('toRegisteredConnectorEvent', () => {
  it('resolves registered event', () => {
    const def = defineConnectorEvent({
      eventId: 'inboundWebhook.received',
      title: 'Webhook received',
      description: 'Fires when an authenticated request hits this connector endpoint.',
      eventSchema: inboundWebhookReceivedEventSchema,
    });

    const registered = toRegisteredConnectorEvent(inboundWebhookMetadata, 'received', def);

    expect(registered).toEqual({
      ...def,
      connectorTypeId: '.inboundWebhook',
      eventKey: 'received',
    });
  });

  it('throws when eventId does not match convention', () => {
    const def = defineConnectorEvent({
      eventId: 'wrong.event',
      title: 'Webhook received',
      description: 'Invalid',
      eventSchema: inboundWebhookReceivedEventSchema,
    });

    expect(() => toRegisteredConnectorEvent(inboundWebhookMetadata, 'received', def)).toThrow(
      /eventId mismatch/
    );
  });
});
