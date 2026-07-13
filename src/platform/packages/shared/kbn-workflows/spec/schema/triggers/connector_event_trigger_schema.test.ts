/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { collectConnectorEventsFromTypes, getTriggerSchema } from '.';
import type { ConnectorEventInfo } from '../../../types/latest';

const inboundWebhookReceived: ConnectorEventInfo = {
  eventKey: 'received',
  eventId: 'inboundWebhook.received',
  title: 'Webhook received',
  description: 'Fires when an inbound webhook request is received',
};

describe('connector-event trigger schema', () => {
  const triggerSchema = getTriggerSchema(['cases.updated'], [inboundWebhookReceived]);

  it('requires connector-id for connector-event triggers', () => {
    expect(
      triggerSchema.safeParse({
        type: 'inboundWebhook.received',
        on: { condition: 'event.body.eventType: "order.created"' },
      }).success
    ).toBe(false);

    expect(
      triggerSchema.safeParse({
        type: 'inboundWebhook.received',
        'connector-id': 'sales-ingress',
        on: { condition: 'event.body.eventType: "order.created"' },
      }).success
    ).toBe(true);
  });

  it('accepts optional on block on connector-event triggers', () => {
    expect(
      triggerSchema.safeParse({
        type: 'inboundWebhook.received',
        'connector-id': 'sales-ingress',
      }).success
    ).toBe(true);

    expect(
      triggerSchema.safeParse({
        type: 'inboundWebhook.received',
        'connector-id': 'sales-ingress',
        on: {},
      }).success
    ).toBe(true);
  });

  it('does not require connector-id for plain custom triggers', () => {
    expect(triggerSchema.safeParse({ type: 'cases.updated' }).success).toBe(true);
  });

  it('prefers connector-event schema when the same id is registered as a custom trigger', () => {
    const schemaWithOverlap = getTriggerSchema(
      ['inboundWebhook.received'],
      [inboundWebhookReceived]
    );

    expect(
      schemaWithOverlap.safeParse({
        type: 'inboundWebhook.received',
      }).success
    ).toBe(false);

    expect(
      schemaWithOverlap.safeParse({
        type: 'inboundWebhook.received',
        'connector-id': 'sales-ingress',
      }).success
    ).toBe(true);
  });
});

describe('collectConnectorEventsFromTypes', () => {
  it('flattens events from all connector types', () => {
    expect(
      collectConnectorEventsFromTypes({
        '.inboundWebhook': {
          actionTypeId: '.inboundWebhook',
          displayName: 'Inbound Webhook',
          instances: [],
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          subActions: [],
          events: [inboundWebhookReceived],
        },
      })
    ).toEqual([inboundWebhookReceived]);
  });
});
