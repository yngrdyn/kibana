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

jest.mock('../../../../../common/lib/is_connector_event_trigger_id', () => ({
  isConnectorEventTriggerId: jest.fn(() => false),
}));

import { generateTriggerSnippet } from './generate_trigger_snippet';
import { isConnectorEventTriggerId } from '../../../../../common/lib/is_connector_event_trigger_id';
import { triggerSchemas } from '../../../../trigger_schemas';

describe('generateTriggerSnippet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue(undefined);
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
    it('includes connector-id placeholder when the trigger requires connector binding', () => {
      (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
        id: 'exampleInboundWebhook.received',
        requiresConnectorId: true,
        snippets: {
          condition: 'event.body: *',
        },
      });

      const snippet = generateTriggerSnippet('exampleInboundWebhook.received', { full: true });

      expect(snippet).toContain('connector-id: <connector-id>');
      expect(snippet).toContain('condition: "event.body: *"');
    });

    it('uses an explicit defaultConnectorId when provided', () => {
      (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
        id: 'exampleInboundWebhook.received',
        requiresConnectorId: true,
      });

      const snippet = generateTriggerSnippet('exampleInboundWebhook.received', {
        full: true,
        defaultConnectorId: 'example-inbound-webhook',
      });

      expect(snippet).toContain('connector-id: example-inbound-webhook');
    });

    it('includes connector-id when the extension trigger requires connector binding', () => {
      (triggerSchemas.getTriggerDefinition as jest.Mock).mockReturnValue({
        id: 'inboundWebhook.received',
        requiresConnectorId: true,
      });

      const snippet = generateTriggerSnippet('inboundWebhook.received', { full: true });

      expect(snippet).toContain('connector-id: <connector-id>');
      expect(snippet).toContain('condition:');
    });

    it('includes connector-id for cached connector-event triggers without extension registration', () => {
      (isConnectorEventTriggerId as jest.Mock).mockReturnValueOnce(true);

      const snippet = generateTriggerSnippet('inboundWebhook.received', { full: true });

      expect(snippet).toContain('connector-id: <connector-id>');
      expect(snippet).toContain('condition:');
    });
  });
});
