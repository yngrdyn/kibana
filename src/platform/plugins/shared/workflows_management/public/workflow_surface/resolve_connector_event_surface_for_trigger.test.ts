/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorTypeInfo } from '@kbn/workflows';
import {
  findConnectorTypeIdForEventTrigger,
  inferConnectorTypeIdFromEventId,
  resolveConnectorEventSurfaceForTriggerId,
} from './resolve_connector_event_surface_for_trigger';

describe('resolve_connector_event_surface_for_trigger', () => {
  const extensionTrigger = {
    id: 'exampleInboundWebhook.received',
    title: 'Example webhook received',
    description: 'Dev trigger',
    stability: 'tech_preview' as const,
    requiresConnectorId: true,
    eventSchema: {} as never,
  };

  const connectorTypes: Record<string, ConnectorTypeInfo> = {
    '.exampleInboundWebhook': {
      actionTypeId: '.exampleInboundWebhook',
      displayName: 'Example Inbound Webhook',
      instances: [
        {
          id: 'example-inbound-webhook',
          name: 'Example Inbound Webhook',
          isPreconfigured: true,
          isDeprecated: false,
        },
      ],
      enabled: true,
      enabledInConfig: true,
      enabledInLicense: true,
      minimumLicenseRequired: 'gold',
      subActions: [],
      events: [
        {
          eventKey: 'received',
          eventId: 'exampleInboundWebhook.received',
          title: 'Example webhook received',
          description: 'Dev trigger',
        },
      ],
    },
  };

  it('infers connector type id from trigger event id namespace', () => {
    expect(inferConnectorTypeIdFromEventId('exampleInboundWebhook.received')).toBe(
      '.exampleInboundWebhook'
    );
  });

  it('finds connector type id from dynamic connector types events', () => {
    expect(
      findConnectorTypeIdForEventTrigger('exampleInboundWebhook.received', connectorTypes)
    ).toBe('.exampleInboundWebhook');
  });

  it('builds a connector-event surface from extension trigger metadata and connector types', () => {
    const surface = resolveConnectorEventSurfaceForTriggerId(
      'exampleInboundWebhook.received',
      connectorTypes,
      extensionTrigger
    );

    expect(surface).toMatchObject({
      id: 'exampleInboundWebhook.received',
      kind: 'trigger',
      binding: {
        connectorTypeId: '.exampleInboundWebhook',
        instanceRef: 'required',
      },
      source: {
        type: 'connector-event',
        connectorTypeId: '.exampleInboundWebhook',
        eventKey: 'received',
      },
    });
  });
});
