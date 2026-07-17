/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID } from '../../common/inbound_webhook/constants';
import { resolveConnectorIdBinding } from './resolve_connector_id_binding';

describe('resolveConnectorIdBinding', () => {
  it('resolves connector-event trigger connector-id bindings from trigger type', () => {
    const yamlDocument = parseDocument(`
triggers:
  - type: ${INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID}
    connector-id:
`);

    const binding = resolveConnectorIdBinding({
      focusedStepInfo: null,
      focusedYamlPair: null,
      path: ['triggers', 0, 'connector-id'],
      yamlDocument,
    });

    expect(binding).toEqual({
      connectorTypeId: '.workflows-inbound-webhook',
      lookupKey: 'workflows-inbound-webhook',
    });
  });

  it('falls back to step connector-id binding outside triggers', () => {
    const binding = resolveConnectorIdBinding({
      focusedStepInfo: { stepType: 'slack' },
      focusedYamlPair: null,
      path: ['steps', 0, 'connector-id'],
      yamlDocument: parseDocument('steps:\n  - type: slack\n    connector-id:\n'),
    });

    expect(binding).toEqual({
      connectorTypeId: '.slack',
      lookupKey: 'slack',
    });
  });

  it('returns undefined for trigger connector-id when trigger type is unknown', () => {
    const yamlDocument = parseDocument(`
triggers:
  - type: manual
    connector-id:
`);

    const binding = resolveConnectorIdBinding({
      focusedStepInfo: null,
      focusedYamlPair: null,
      path: ['triggers', 0, 'connector-id'],
      yamlDocument,
    });

    expect(binding).toBeUndefined();
  });
});
