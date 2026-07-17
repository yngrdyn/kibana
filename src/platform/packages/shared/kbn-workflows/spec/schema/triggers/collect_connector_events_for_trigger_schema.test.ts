/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getTriggerSchema } from '.';
import { collectConnectorEventsForTriggerSchema } from './collect_connector_events_for_trigger_schema';
import type { ConnectorEventInfo } from '../../../types/latest';

const inboundWebhookReceived: ConnectorEventInfo = {
  eventKey: 'received',
  eventId: 'inboundWebhook.received',
  title: 'Webhook received',
  description: 'Fires when an inbound webhook request is received',
};

describe('collectConnectorEventsForTriggerSchema', () => {
  it('merges connector events from registered triggers that require connector-id', () => {
    const result = collectConnectorEventsForTriggerSchema({}, [
      {
        id: 'exampleInboundWebhook.received',
        title: 'Example webhook received',
        description: 'Dev-only trigger',
        stability: 'tech_preview',
        requiresConnectorId: true,
      },
    ]);

    expect(result.connectorEvents).toEqual([
      {
        eventKey: 'received',
        eventId: 'exampleInboundWebhook.received',
        title: 'Example webhook received',
        description: 'Dev-only trigger',
        stability: 'tech_preview',
      },
    ]);
  });

  it('requires connector-id in the trigger schema for extension-registered connector events', () => {
    const { connectorEvents, customTriggerIds } = collectConnectorEventsForTriggerSchema({}, [
      {
        id: 'exampleInboundWebhook.received',
        title: 'Example webhook received',
        description: 'Dev-only trigger',
        requiresConnectorId: true,
      },
    ]);

    const triggerSchema = getTriggerSchema(customTriggerIds, connectorEvents);

    expect(
      triggerSchema.safeParse({
        type: 'exampleInboundWebhook.received',
        on: { condition: 'event.body: *' },
      }).success
    ).toBe(false);

    expect(
      triggerSchema.safeParse({
        type: 'exampleInboundWebhook.received',
        'connector-id': 'example-inbound-webhook',
        on: { condition: 'event.body: *' },
      }).success
    ).toBe(true);
  });

  it('does not duplicate connector events already discovered from connector types', () => {
    const result = collectConnectorEventsForTriggerSchema(
      {
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
      },
      [
        {
          id: 'inboundWebhook.received',
          title: 'Webhook received',
          description: 'Duplicate registration',
          requiresConnectorId: true,
        },
      ]
    );

    expect(result.connectorEvents).toEqual([inboundWebhookReceived]);
  });
});
