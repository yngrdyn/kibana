/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiThemeComputed } from '@elastic/eui';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import { buildConnectorEventTriggerOptions } from './build_connector_event_trigger_options';
import { isActionConnectorOption, isActionOption } from '../types';

describe('buildConnectorEventTriggerOptions', () => {
  const mockEuiTheme = {
    colors: {
      vis: {
        euiColorVis6: '#color6',
      },
    },
  } as unknown as EuiThemeComputed<{}>;

  const inboundWebhookType: ConnectorTypeInfo = {
    actionTypeId: '.inboundWebhook',
    displayName: 'Inbound Webhook',
    instances: [],
    enabled: true,
    enabledInConfig: true,
    enabledInLicense: true,
    minimumLicenseRequired: 'basic',
    subActions: [],
    events: [
      {
        eventKey: 'received',
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'When an HTTP request is received on the connector endpoint.',
        stability: 'tech_preview',
      },
    ],
  };

  it('returns connector-event trigger options with connector type icons', () => {
    const result = buildConnectorEventTriggerOptions(
      { '.inboundWebhook': inboundWebhookType },
      new Set(),
      mockEuiTheme
    );

    expect(result).toHaveLength(1);
    const option = result[0];
    expect(option?.id).toBe('inboundWebhook.received');
    expect(option?.label).toBe('Webhook received');
    if (option && isActionConnectorOption(option)) {
      expect(option.connectorType).toBe('.inboundWebhook');
      expect(option.stability).toBe('tech_preview');
    } else {
      throw new Error('Expected connector-event trigger option');
    }
  });

  it('skips events already registered via workflows_extensions', () => {
    const result = buildConnectorEventTriggerOptions(
      { '.inboundWebhook': inboundWebhookType },
      new Set(['inboundWebhook.received']),
      mockEuiTheme
    );

    expect(result).toHaveLength(0);
  });

  it('returns an empty list when connector types declare no events', () => {
    const result = buildConnectorEventTriggerOptions(
      {
        '.slack': {
          actionTypeId: '.slack',
          displayName: 'Slack',
          instances: [],
          enabled: true,
          enabledInConfig: true,
          enabledInLicense: true,
          minimumLicenseRequired: 'basic',
          subActions: [],
        },
      },
      new Set(),
      mockEuiTheme
    );

    expect(result).toHaveLength(0);
  });

  it('groups multiple events from the same namespace', () => {
    const connectorTypeWithMultipleEvents: ConnectorTypeInfo = {
      ...inboundWebhookType,
      events: [
        {
          eventKey: 'received',
          eventId: 'inboundWebhook.received',
          title: 'Inbound Webhook - Webhook received',
          description: 'When a webhook is received.',
          stability: 'tech_preview',
        },
        {
          eventKey: 'failed',
          eventId: 'inboundWebhook.failed',
          title: 'Inbound Webhook - Webhook failed',
          description: 'When webhook processing fails.',
          stability: 'tech_preview',
        },
      ],
    };

    const result = buildConnectorEventTriggerOptions(
      { '.inboundWebhook': connectorTypeWithMultipleEvents },
      new Set(),
      mockEuiTheme
    );

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(group?.id).toBe('triggers.inboundWebhook');
    if (group && 'options' in group) {
      expect(group.options).toHaveLength(2);
      for (const option of group.options) {
        if (isActionConnectorOption(option)) {
          expect(option.connectorType).toBe('.inboundWebhook');
        } else if (isActionOption(option)) {
          throw new Error('Expected nested connector-event options to use connector icons');
        }
      }
    }
  });
});
