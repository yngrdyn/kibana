/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  connectorEventTriggerInstanceMatches,
  isConnectorEventTriggerId,
  readEventConnectorId,
  readTriggerConnectorId,
} from './connector_event_trigger_gate';

jest.mock('@kbn/workflows', () => ({
  ...jest.requireActual('@kbn/workflows'),
  resolveConnectorEventTriggerDefinition: jest.fn((triggerId: string) =>
    triggerId === 'inboundWebhook.received' ? { id: triggerId } : undefined
  ),
}));

describe('connector_event_trigger_gate', () => {
  describe('isConnectorEventTriggerId', () => {
    it('returns true for connector-event trigger ids', () => {
      expect(isConnectorEventTriggerId('inboundWebhook.received')).toBe(true);
    });

    it('returns false for plain custom trigger ids', () => {
      expect(isConnectorEventTriggerId('cases.updated')).toBe(false);
    });
  });

  describe('readTriggerConnectorId', () => {
    it('reads connector-id from trigger blocks', () => {
      expect(
        readTriggerConnectorId({ type: 'inboundWebhook.received', 'connector-id': 'sales-ingress' })
      ).toBe('sales-ingress');
    });

    it('returns undefined when connector-id is missing or blank', () => {
      expect(readTriggerConnectorId({ type: 'inboundWebhook.received' })).toBeUndefined();
      expect(
        readTriggerConnectorId({ type: 'inboundWebhook.received', 'connector-id': '  ' })
      ).toBeUndefined();
    });
  });

  describe('readEventConnectorId', () => {
    it('reads connectorId from emit payloads', () => {
      expect(readEventConnectorId({ connectorId: 'sales-ingress', body: { ok: true } })).toBe(
        'sales-ingress'
      );
    });

    it('returns undefined when connectorId is missing or blank', () => {
      expect(readEventConnectorId({ body: {} })).toBeUndefined();
      expect(readEventConnectorId({ connectorId: '' })).toBeUndefined();
    });
  });

  describe('connectorEventTriggerInstanceMatches', () => {
    it('matches when trigger connector-id equals payload connectorId', () => {
      expect(
        connectorEventTriggerInstanceMatches(
          { type: 'inboundWebhook.received', 'connector-id': 'sales-ingress' },
          { connectorId: 'sales-ingress', body: {} }
        )
      ).toBe(true);
    });

    it('does not match when ids differ or are missing', () => {
      expect(
        connectorEventTriggerInstanceMatches(
          { type: 'inboundWebhook.received', 'connector-id': 'sales-ingress' },
          { connectorId: 'other-ingress', body: {} }
        )
      ).toBe(false);

      expect(
        connectorEventTriggerInstanceMatches(
          { type: 'inboundWebhook.received', 'connector-id': 'sales-ingress' },
          { body: {} }
        )
      ).toBe(false);

      expect(
        connectorEventTriggerInstanceMatches(
          { type: 'inboundWebhook.received' },
          { connectorId: 'sales-ingress', body: {} }
        )
      ).toBe(false);
    });
  });
});
