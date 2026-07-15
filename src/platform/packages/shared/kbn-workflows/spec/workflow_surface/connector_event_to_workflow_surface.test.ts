/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { inboundWebhookReceivedEventSchema } from '@kbn/connector-specs';
import {
  defineConnectorEvent,
  toRegisteredConnectorEvent,
} from '@kbn/connector-specs';
import type { ConnectorMetadata } from '@kbn/connector-specs';
import { connectorEventToWorkflowSurface } from './connector_event_to_workflow_surface';

const inboundWebhookMetadata: ConnectorMetadata = {
  id: '.inboundWebhook',
  displayName: 'Inbound Webhook',
  description: 'Receive HTTP requests from external systems',
  minimumLicense: 'gold',
  supportedFeatureIds: ['workflows'],
};

describe('connectorEventToWorkflowSurface', () => {
  it('maps inboundWebhook.received to a trigger surface with required connector binding', () => {
    const registered = toRegisteredConnectorEvent(
      inboundWebhookMetadata,
      'received',
      defineConnectorEvent({
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Fires when an authenticated request hits this connector endpoint.',
        eventSchema: inboundWebhookReceivedEventSchema,
      })
    );

    const surface = connectorEventToWorkflowSurface(registered);

    expect(surface).toEqual({
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
        input: inboundWebhookReceivedEventSchema,
        filter: {
          schema: inboundWebhookReceivedEventSchema,
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
  });

  it('preserves explicit stability from the connector event', () => {
    const registered = toRegisteredConnectorEvent(
      inboundWebhookMetadata,
      'received',
      defineConnectorEvent({
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Stable webhook ingress.',
        eventSchema: inboundWebhookReceivedEventSchema,
        stability: 'beta',
      })
    );

    expect(connectorEventToWorkflowSurface(registered).stability).toBe('beta');
  });
});
