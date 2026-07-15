/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { z } from '@kbn/zod/v4';

const mockInboundWebhookReceivedEventSchema = z.object({
  connectorId: z.string(),
  body: z.unknown(),
});

jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    resolveConnectorEventWorkflowSurface: jest.fn((eventId: string) =>
      eventId === 'inboundWebhook.received'
        ? {
            id: 'inboundWebhook.received',
            kind: 'trigger',
            title: 'Webhook received',
            description: 'Fires when an authenticated request hits this connector endpoint.',
            stability: 'tech_preview',
            binding: {
              connectorTypeId: '.inboundWebhook',
              instanceRef: 'required',
            },
            surfaces: {
              filter: {
                schema: mockInboundWebhookReceivedEventSchema,
                language: 'kql',
                yamlPath: 'on.condition',
              },
            },
          }
        : undefined
    ),
  };
});

import { resolveSurfaceAtPath } from './resolve_surface_at_path';

describe('resolveSurfaceAtPath', () => {
  const yaml = `triggers:
  - type: inboundWebhook.received
    connector-id: sales-ingress
    on:
      condition: 'event.body.eventType: "order.created"'
`;

  it('resolves connector-id role on triggers[i].connector-id', () => {
    const doc = parseDocument(yaml);
    expect(resolveSurfaceAtPath(doc, ['triggers', 0, 'connector-id'])).toEqual({
      role: 'connector-id',
      surface: expect.objectContaining({
        id: 'inboundWebhook.received',
        binding: { connectorTypeId: '.inboundWebhook', instanceRef: 'required' },
      }),
    });
  });

  it('resolves kql-filter role on triggers[i].on.condition', () => {
    const doc = parseDocument(yaml);
    expect(resolveSurfaceAtPath(doc, ['triggers', 0, 'on', 'condition'])).toEqual({
      role: 'kql-filter',
      surface: expect.objectContaining({ id: 'inboundWebhook.received' }),
    });
  });

  it('returns undefined for plain custom triggers', () => {
    const doc = parseDocument(`triggers:
  - type: cases.updated
    on:
      condition: 'event.severity: "high"'
`);
    expect(resolveSurfaceAtPath(doc, ['triggers', 0, 'on', 'condition'])).toBeUndefined();
  });
});
