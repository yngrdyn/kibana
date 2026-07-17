/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import { resolveSurfaceAtPath } from './resolve_surface_at_path';
import { triggerSchemas } from '../trigger_schemas';

jest.mock('../trigger_schemas', () => ({
  triggerSchemas: {
    getTriggerDefinition: jest.fn(),
  },
}));

describe('resolveSurfaceAtPath', () => {
  const connectorTypes: Record<string, ConnectorTypeInfo> = {
    '.inboundWebhook': {
      actionTypeId: '.inboundWebhook',
      displayName: 'Inbound Webhook',
      instances: [],
      enabled: true,
      enabledInConfig: true,
      enabledInLicense: true,
      minimumLicenseRequired: 'gold',
      subActions: [],
      events: [
        {
          eventKey: 'received',
          eventId: 'inboundWebhook.received',
          title: 'Webhook received',
          description: 'Fires when an authenticated request hits this connector endpoint.',
        },
      ],
    },
  };

  const yaml = `triggers:
  - type: inboundWebhook.received
    connector-id: sales-ingress
    on:
      condition: 'event.body.eventType: "order.created"'
`;

  beforeEach(() => {
    jest.clearAllMocks();
    (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue(undefined);
  });

  it('resolves connector-id role on triggers[i].connector-id', () => {
    (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
      id: 'inboundWebhook.received',
      title: 'Webhook received',
      description: 'Fires when an authenticated request hits this connector endpoint.',
      stability: 'tech_preview',
      requiresConnectorId: true,
    });
    const doc = parseDocument(yaml);
    expect(
      resolveSurfaceAtPath(doc, ['triggers', 0, 'connector-id'], { connectorTypes })
    ).toEqual({
      role: 'connector-id',
      surface: expect.objectContaining({
        id: 'inboundWebhook.received',
        binding: { connectorTypeId: '.inboundWebhook', instanceRef: 'required' },
      }),
    });
  });

  it('resolves kql-filter role on triggers[i].on.condition', () => {
    (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
      id: 'inboundWebhook.received',
      title: 'Webhook received',
      description: 'Fires when an authenticated request hits this connector endpoint.',
      stability: 'tech_preview',
      requiresConnectorId: true,
    });
    const doc = parseDocument(yaml);
    expect(
      resolveSurfaceAtPath(doc, ['triggers', 0, 'on', 'condition'], { connectorTypes })
    ).toEqual({
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
    expect(
      resolveSurfaceAtPath(doc, ['triggers', 0, 'on', 'condition'], { connectorTypes })
    ).toBeUndefined();
  });
});
