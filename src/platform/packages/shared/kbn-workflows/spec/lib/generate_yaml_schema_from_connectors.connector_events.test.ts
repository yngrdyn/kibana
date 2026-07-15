/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { generateYamlSchemaFromConnectors } from '../..';

const inboundWebhookReceived = {
  eventKey: 'received',
  eventId: 'inboundWebhook.received',
  title: 'Webhook received',
  description: 'Fires when an inbound webhook request is received',
};

describe('generateYamlSchemaFromConnectors connector-event triggers', () => {
  it('validates connector-id on connector-event triggers in strict mode', () => {
    const schema = generateYamlSchemaFromConnectors([], {
      connectorEvents: [inboundWebhookReceived],
    });

    expect(
      schema.safeParse({
        name: 'test',
        triggers: [
          {
            type: 'inboundWebhook.received',
            on: { condition: 'event.body.eventType: "order.created"' },
          },
        ],
        steps: [{ name: 'wait-step', type: 'wait', with: { duration: '1s' } }],
      }).success
    ).toBe(false);

    const result = schema.safeParse({
      name: 'test',
      triggers: [
        {
          type: 'inboundWebhook.received',
          'connector-id': 'sales-ingress',
          on: { condition: 'event.body.eventType: "order.created"' },
        },
      ],
      steps: [{ name: 'wait-step', type: 'wait', with: { duration: '1s' } }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(
        expect.objectContaining({
          triggers: [
            expect.objectContaining({
              type: 'inboundWebhook.received',
              'connector-id': 'sales-ingress',
            }),
          ],
        })
      );
    }
  });
});
