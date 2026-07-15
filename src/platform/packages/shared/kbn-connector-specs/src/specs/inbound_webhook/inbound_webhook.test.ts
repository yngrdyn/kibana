/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';

import { INBOUND_WEBHOOK_RECEIVED_EVENT_ID } from '@kbn/connector-specs';
import { InboundWebhookConnector } from './inbound_webhook';

describe('InboundWebhookConnector.handleEvents', () => {
  it('returns inboundWebhook.received payload', async () => {
    const result = await InboundWebhookConnector.events!.handleEvents({
      connectorId: 'sales-ingress',
      connectorTypeId: '.inboundWebhook',
      spaceId: 'default',
      config: {},
      secrets: {},
      rawBody: { eventType: 'order.created' },
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        'x-custom': 'value',
        'x-inbound-query': JSON.stringify({ source: 'shopify' }),
      },
      log: loggingSystemMock.create().get(),
    });

    expect(result.httpResponse).toBeUndefined();
    expect(result.events).toHaveLength(1);
    expect(result.events?.[0]?.eventId).toBe(INBOUND_WEBHOOK_RECEIVED_EVENT_ID);
    expect(result.events?.[0]?.payload.body).toEqual({ eventType: 'order.created' });
    expect(result.events?.[0]?.payload.headers).toEqual({
      'content-type': 'application/json',
      'x-custom': 'value',
    });
    expect(result.events?.[0]?.payload.query).toEqual({ source: 'shopify' });
  });
});
