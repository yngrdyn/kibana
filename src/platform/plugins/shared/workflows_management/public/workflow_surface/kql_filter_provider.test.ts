/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { z } from '@kbn/zod/v4';
import { getTriggerConditionDefinition } from './kql_filter_provider';
import { triggerSchemas } from '../trigger_schemas';

const CONDITION_PATH = ['triggers', 0, 'on', 'condition'] as const;

const mockConnectorEventSchema = z.object({
  connectorId: z.string(),
  body: z.unknown(),
});

describe('getTriggerConditionDefinition', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns connector-event trigger definitions with eventSchema for KQL autocomplete', () => {
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue({
      id: 'inboundWebhook.received',
      title: 'Webhook received',
      description: 'Fires when an authenticated request hits this connector endpoint.',
      stability: 'tech_preview',
      requiresConnectorId: true,
      eventSchema: mockConnectorEventSchema,
    });

    const doc = parseDocument(`triggers:
  - type: inboundWebhook.received
    connector-id: sales-ingress
    on:
      condition: "event.body.eventType: *"
`);

    expect(getTriggerConditionDefinition(doc, [...CONDITION_PATH])).toEqual({
      id: 'inboundWebhook.received',
      title: 'Webhook received',
      description: 'Fires when an authenticated request hits this connector endpoint.',
      stability: 'tech_preview',
      requiresConnectorId: true,
      eventSchema: mockConnectorEventSchema,
    });
  });

  it('prefers workflows_extensions trigger definitions', () => {
    const registered = {
      id: 'cases.updated',
      stability: 'tech_preview' as const,
      title: 'Cases updated',
      description: 'Cases updated',
      eventSchema: z.object({ severity: z.string() }),
    };
    jest.spyOn(triggerSchemas, 'getTriggerDefinition').mockReturnValue(registered);

    const doc = parseDocument(`triggers:
  - type: cases.updated
    on:
      condition: "event.severity: *"
`);

    expect(getTriggerConditionDefinition(doc, [...CONDITION_PATH])).toBe(registered);
  });
});
