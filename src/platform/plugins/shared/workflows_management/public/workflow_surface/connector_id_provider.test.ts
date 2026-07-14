/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { resolveConnectorIdActionTypeId, resolveConnectorIdBinding } from './connector_id_provider';
import type { StepInfo } from '../entities/workflows/store';

jest.mock('./resolve_surface_at_path', () => ({
  resolveSurfaceAtPath: jest.fn((_, path: (string | number)[]) =>
    path[0] === 'triggers' && path[2] === 'connector-id'
      ? {
          role: 'connector-id',
          surface: {
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
          },
        }
      : undefined
  ),
}));

describe('resolveConnectorIdActionTypeId', () => {
  it('uses connector-event surface binding for trigger connector-id fields', () => {
    const yamlDocument = parseDocument(`triggers:
  - type: inboundWebhook.received
    connector-id: `);

    expect(
      resolveConnectorIdActionTypeId({
        yamlDocument,
        path: ['triggers', 0, 'connector-id'],
        focusedStepInfo: null,
        focusedYamlPair: null,
      })
    ).toBe('.inboundWebhook');
  });

  it('requires connector types with declared events for connector-event surfaces', () => {
    const yamlDocument = parseDocument(`triggers:
  - type: inboundWebhook.received
    connector-id: `);

    expect(
      resolveConnectorIdBinding({
        yamlDocument,
        path: ['triggers', 0, 'connector-id'],
        focusedStepInfo: null,
        focusedYamlPair: null,
      })
    ).toEqual({
      connectorTypeId: '.inboundWebhook',
      requireConnectorTypeEvents: true,
      lookupKey: '.inboundWebhook',
    });
  });

  it('falls back to step connector type resolution', () => {
    const yamlDocument = parseDocument(`steps:
  - name: notify
    type: slack
    connector-id: `);

    expect(
      resolveConnectorIdActionTypeId({
        yamlDocument,
        path: ['steps', 0, 'connector-id'],
        focusedStepInfo: { stepType: 'slack' } as StepInfo,
        focusedYamlPair: null,
      })
    ).toBe('slack');
  });
});
