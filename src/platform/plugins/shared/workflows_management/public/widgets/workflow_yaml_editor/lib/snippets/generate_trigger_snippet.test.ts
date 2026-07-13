/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('../../../../trigger_schemas', () => ({
  triggerSchemas: {
    getTriggerDefinition: jest.fn(),
  },
}));

jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    resolveConnectorEventWorkflowSurface: jest.fn(),
  };
});

import { resolveConnectorEventWorkflowSurface } from '@kbn/workflows';
import { generateTriggerSnippet } from './generate_trigger_snippet';
import { triggerSchemas } from '../../../../trigger_schemas';

describe('generateTriggerSnippet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue(undefined);
    (resolveConnectorEventWorkflowSurface as jest.Mock).mockReturnValue(undefined);
  });
  describe('built-in trigger types (alert, manual, scheduled)', () => {
    it('should not include on.condition for alert, manual or scheduled', () => {
      const builtInTypes = ['alert', 'manual', 'scheduled'] as const;
      for (const triggerType of builtInTypes) {
        const snippet = generateTriggerSnippet(triggerType, {
          full: true,
          defaultCondition: 'event.message:*test*',
        });
        expect(snippet).not.toContain('condition:');
      }
    });
  });

  describe('custom triggers with defaultCondition', () => {
    it('should include defaultCondition in the snippet when provided', () => {
      const snippet = generateTriggerSnippet('custom.my_trigger', {
        full: true,
        defaultCondition: 'event.source:ui and event.message:*important*',
      });
      expect(snippet).toContain('condition:');
      expect(snippet).toContain('event.source:ui and event.message:*important*');
    });

    it('should use empty condition when defaultCondition is not provided', () => {
      const snippet = generateTriggerSnippet('custom.my_trigger', { full: true });
      expect(snippet).toContain('condition:');
      expect(snippet).not.toContain('event.source:ui');
    });
  });

  describe('connector-event triggers', () => {
    it('includes connector-id when the trigger requires connector binding', () => {
      (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
        id: 'exampleInboundWebhook.received',
        requiresConnectorId: true,
        snippets: {
          connectorId: 'example-inbound-webhook',
          condition: 'event.body: *',
        },
      });

      const snippet = generateTriggerSnippet('exampleInboundWebhook.received', { full: true });

      expect(snippet).toContain('connector-id: example-inbound-webhook');
      expect(snippet).toContain('condition: "event.body: *"');
    });

    it('includes connector-id when resolved from connector-event workflow surface', () => {
      (resolveConnectorEventWorkflowSurface as jest.Mock).mockReturnValue({
        binding: { connectorTypeId: '.inboundWebhook', instanceRef: 'required' },
      });

      const snippet = generateTriggerSnippet('inboundWebhook.received', { full: true });

      expect(snippet).toContain('connector-id: <connector-id>');
      expect(snippet).toContain('condition:');
    });
  });
});
