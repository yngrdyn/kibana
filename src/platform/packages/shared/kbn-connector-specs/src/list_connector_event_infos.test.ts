/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import type { ConnectorMetadata, ConnectorSpec } from './connector_spec';
import { defineConnectorEvent } from './define_connector_event';
import {
  listConnectorEventInfos,
  listConnectorEventInfosForType,
} from './list_connector_event_infos';

const inboundWebhookMetadata: ConnectorMetadata = {
  id: '.inboundWebhook',
  displayName: 'Inbound Webhook',
  description: 'Receive HTTP requests from external systems',
  minimumLicense: 'gold',
  supportedFeatureIds: ['workflows'],
};

const inboundWebhookSpec: ConnectorSpec = {
  metadata: inboundWebhookMetadata,
  actions: {},
  events: {
    definitions: {
      received: defineConnectorEvent({
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Fires when an authenticated request hits this connector endpoint.',
        eventSchema: z.object({
          connectorId: z.string(),
          body: z.unknown(),
        }),
      }),
    },
    handleEvents: async () => ({ events: [] }),
  },
};

describe('listConnectorEventInfos', () => {
  it('returns event metadata from a connector spec', () => {
    expect(listConnectorEventInfos(inboundWebhookSpec)).toEqual([
      {
        eventKey: 'received',
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Fires when an authenticated request hits this connector endpoint.',
        stability: undefined,
      },
    ]);
  });

  it('returns an empty array when the spec has no events', () => {
    expect(
      listConnectorEventInfos({
        metadata: inboundWebhookMetadata,
        actions: {},
      })
    ).toEqual([]);
  });
});

describe('listConnectorEventInfosForType', () => {
  it('returns an empty array for unknown connector types', () => {
    expect(listConnectorEventInfosForType('.does-not-exist')).toEqual([]);
  });
});
