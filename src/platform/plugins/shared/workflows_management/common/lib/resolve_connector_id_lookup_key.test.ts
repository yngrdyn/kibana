/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID } from '../inbound_webhook/constants';
import { resolveConnectorIdLookupKeyFromYamlType } from './resolve_connector_id_lookup_key';

describe('resolveConnectorIdLookupKeyFromYamlType', () => {
  it('maps connector-event trigger ids to connector action type lookup keys', () => {
    expect(resolveConnectorIdLookupKeyFromYamlType(INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID)).toBe(
      'workflows-inbound-webhook'
    );
  });

  it('returns step connector types unchanged', () => {
    expect(resolveConnectorIdLookupKeyFromYamlType('slack')).toBe('slack');
  });
});
