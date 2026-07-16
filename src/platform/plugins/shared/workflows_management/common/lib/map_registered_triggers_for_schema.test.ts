/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getTriggerSchema } from '@kbn/workflows/spec/schema/triggers';
import { collectConnectorEventsForTriggerSchema } from '@kbn/workflows/spec/schema/triggers/collect_connector_events_for_trigger_schema';

import { mapRegisteredTriggersForSchema } from './map_registered_triggers_for_schema';

describe('mapRegisteredTriggersForSchema', () => {
  it('does not require connector-id for extension triggers without explicit connector binding', () => {
    const registeredTriggers = mapRegisteredTriggersForSchema([
      {
        id: 'cases.caseUpdated',
        title: 'Cases - Case updated',
        description: 'Emitted when a case is updated.',
        stability: 'tech_preview',
      },
    ]);

    expect(registeredTriggers).toEqual([
      {
        id: 'cases.caseUpdated',
        title: 'Cases - Case updated',
        description: 'Emitted when a case is updated.',
        stability: 'tech_preview',
        requiresConnectorId: false,
      },
    ]);

    const { connectorEvents, customTriggerIds } = collectConnectorEventsForTriggerSchema(
      {},
      registeredTriggers
    );

    expect(connectorEvents).toEqual([]);
    expect(customTriggerIds).toEqual(['cases.caseUpdated']);

    const triggerSchema = getTriggerSchema(customTriggerIds, connectorEvents);

    expect(
      triggerSchema.safeParse({
        type: 'cases.caseUpdated',
        on: { condition: 'event.caseId: "abc"' },
      }).success
    ).toBe(true);
  });

  it('requires connector-id only when explicitly flagged', () => {
    const registeredTriggers = mapRegisteredTriggersForSchema([
      {
        id: 'inboundWebhook.received',
        title: 'Webhook received',
        description: 'Fires when an inbound webhook request is received',
        stability: 'tech_preview',
        requiresConnectorId: true,
      },
    ]);

    expect(registeredTriggers[0]?.requiresConnectorId).toBe(true);
  });
});
