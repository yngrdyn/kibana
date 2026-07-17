/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorTypeInfo } from '@kbn/workflows';
import { getCachedDynamicConnectorTypes } from '../schema';
import { isConnectorEventTriggerId } from './is_connector_event_trigger_id';

jest.mock('../schema', () => ({
  getCachedDynamicConnectorTypes: jest.fn(() => null),
}));

describe('isConnectorEventTriggerId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCachedDynamicConnectorTypes as jest.Mock).mockReturnValue(null);
  });

  it('returns false when connector types are not cached', () => {
    expect(isConnectorEventTriggerId('inboundWebhook.received')).toBe(false);
  });

  it('returns true when the id matches a cached connector event', () => {
    const connectorTypes: Record<string, ConnectorTypeInfo> = {
      '.inboundWebhook': {
        actionTypeId: '.inboundWebhook',
        displayName: 'Inbound Webhook',
        instances: [],
        enabled: true,
        enabledInConfig: true,
        enabledInLicense: true,
        minimumLicenseRequired: 'basic',
        events: [
          {
            eventKey: 'received',
            eventId: 'inboundWebhook.received',
            title: 'Webhook received',
            description: 'When an HTTP request is received on the connector endpoint.',
            stability: 'tech_preview',
          },
        ],
      },
    };

    (getCachedDynamicConnectorTypes as jest.Mock).mockReturnValue(connectorTypes);

    expect(isConnectorEventTriggerId('inboundWebhook.received')).toBe(true);
    expect(isConnectorEventTriggerId('slack.postMessage')).toBe(false);
  });
});
