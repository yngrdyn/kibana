/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { inboundWebhookReceivedEventSchema } from '@kbn/connector-specs';

const mockInboundWebhookReceivedEventSchema = inboundWebhookReceivedEventSchema;

const mockInboundWebhookReceivedEvent = {
  eventId: 'inboundWebhook.received',
  eventKey: 'received',
  connectorTypeId: '.inboundWebhook',
  title: 'Webhook received',
  description: 'Fires when an authenticated request hits this connector endpoint.',
  eventSchema: mockInboundWebhookReceivedEventSchema,
};

jest.mock('@kbn/connector-specs/server', () => {
  const actual = jest.requireActual('@kbn/connector-specs/server');
  return {
    ...actual,
    resolveRegisteredConnectorEventByEventId: jest.fn((eventId: string) =>
      eventId === 'inboundWebhook.received' ? mockInboundWebhookReceivedEvent : undefined
    ),
  };
});

import { resolveConnectorEventWorkflowSurface } from './resolve_connector_event_workflow_surface';

describe('resolveConnectorEventWorkflowSurface', () => {
  it('returns a trigger surface with required connector binding and KQL filter schema', () => {
    const surface = resolveConnectorEventWorkflowSurface('inboundWebhook.received');

    expect(surface).toMatchObject({
      id: 'inboundWebhook.received',
      kind: 'trigger',
      binding: {
        connectorTypeId: '.inboundWebhook',
        instanceRef: 'required',
      },
      surfaces: {
        filter: {
          language: 'kql',
          yamlPath: 'on.condition',
        },
      },
      source: {
        type: 'connector-event',
        connectorTypeId: '.inboundWebhook',
        eventKey: 'received',
      },
    });
    expect(surface?.surfaces.filter?.schema).toBe(mockInboundWebhookReceivedEventSchema);
  });

  it('returns undefined for unknown event ids', () => {
    expect(resolveConnectorEventWorkflowSurface('unknown.event')).toBeUndefined();
  });
});
