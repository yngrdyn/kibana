/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorTypeInfo, WorkflowSurfaceDefinition } from '@kbn/workflows';
import {
  connectorTypeHasDeclaredEvents,
  listConnectorInstancesForBinding,
  resolveConnectorIdBindingFromStepType,
  resolveConnectorIdBindingFromSurface,
} from './connector_id_binding';

describe('connector_id_binding', () => {
  const inboundWebhookType: ConnectorTypeInfo = {
    actionTypeId: '.inboundWebhook',
    displayName: 'Inbound Webhook',
    instances: [
      {
        id: 'sales-ingress',
        name: 'Sales Ingress',
        isPreconfigured: false,
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
        eventId: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Inbound webhook event.',
      },
    ],
  };

  const slackType: ConnectorTypeInfo = {
    actionTypeId: '.slack',
    displayName: 'Slack',
    instances: [
      {
        id: 'team-slack',
        name: 'Team Slack',
        isPreconfigured: false,
        isDeprecated: false,
      },
    ],
    enabled: true,
    enabledInConfig: true,
    enabledInLicense: true,
    minimumLicenseRequired: 'basic',
    subActions: [],
  };

  const connectorEventSurface: WorkflowSurfaceDefinition = {
    id: 'inboundWebhook.received',
    kind: 'trigger',
    title: 'Webhook received',
    description: 'desc',
    stability: 'tech_preview',
    binding: { connectorTypeId: '.inboundWebhook', instanceRef: 'required' },
    surfaces: {},
    source: {
      type: 'connector-event',
      connectorTypeId: '.inboundWebhook',
      eventKey: 'received',
    },
  };

  describe('resolveConnectorIdBindingFromSurface', () => {
    it('requires connector types with declared events for connector-event surfaces', () => {
      expect(resolveConnectorIdBindingFromSurface(connectorEventSurface)).toEqual({
        connectorTypeId: '.inboundWebhook',
        requireConnectorTypeEvents: true,
        lookupKey: '.inboundWebhook',
      });
    });

    it('does not require events for step surfaces', () => {
      const stepSurface: WorkflowSurfaceDefinition = {
        id: 'slack.postMessage',
        kind: 'step',
        title: 'Slack',
        description: 'Post message',
        stability: 'stable',
        binding: { connectorTypeId: '.slack', instanceRef: 'required' },
        surfaces: {},
      };

      expect(resolveConnectorIdBindingFromSurface(stepSurface)).toEqual({
        connectorTypeId: '.slack',
        requireConnectorTypeEvents: false,
        lookupKey: '.slack',
      });
    });
  });

  describe('listConnectorInstancesForBinding', () => {
    it('returns instances for connector-event surfaces when the type declares events', () => {
      const binding = resolveConnectorIdBindingFromSurface(connectorEventSurface);
      expect(binding).toBeDefined();
      if (!binding) {
        throw new Error('Expected connector-event binding');
      }

      const instances = listConnectorInstancesForBinding(binding, {
        '.inboundWebhook': inboundWebhookType,
      });

      expect(instances.map((instance) => instance.id)).toEqual(['sales-ingress']);
    });

    it('returns no instances for connector-event surfaces when the type has no events', () => {
      const binding = resolveConnectorIdBindingFromSurface(connectorEventSurface);
      expect(binding).toBeDefined();
      if (!binding) {
        throw new Error('Expected connector-event binding');
      }

      const instances = listConnectorInstancesForBinding(binding, {
        '.inboundWebhook': { ...inboundWebhookType, events: undefined },
      });

      expect(instances).toEqual([]);
    });

    it('returns step connector instances without requiring events', () => {
      const binding = resolveConnectorIdBindingFromStepType('slack');

      const instances = listConnectorInstancesForBinding(binding, {
        '.slack': slackType,
      });

      expect(instances.map((instance) => instance.id)).toEqual(['team-slack']);
    });
  });

  describe('connectorTypeHasDeclaredEvents', () => {
    it('returns true when events are declared on the connector type', () => {
      expect(
        connectorTypeHasDeclaredEvents('.inboundWebhook', {
          '.inboundWebhook': inboundWebhookType,
        })
      ).toBe(true);
    });

    it('returns false when events are missing', () => {
      expect(
        connectorTypeHasDeclaredEvents('.slack', {
          '.slack': slackType,
        })
      ).toBe(false);
    });
  });
});
