/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HttpSetup } from '@kbn/core/public';
import {
  buildInboundWebhookExecutionLogFilter,
  loadInboundWebhookExecutionLogs,
} from './load_inbound_webhook_execution_logs';

describe('loadInboundWebhookExecutionLogs', () => {
  it('loads the newest five executions for one inbound webhook connector', async () => {
    const post = jest.fn().mockResolvedValue({ total: 0, data: [] });

    await loadInboundWebhookExecutionLogs({
      http: { post } as unknown as HttpSetup,
      connectorId: 'connector-"quoted"',
    });

    expect(post).toHaveBeenCalledWith('/internal/actions/_global_connector_execution_logs', {
      body: JSON.stringify({
        date_start: '90d',
        filter:
          'kibana.action.id: "connector-\\"quoted\\"" and kibana.action.type_id: ".inboundWebhook"',
        per_page: 5,
        page: 1,
        sort: [{ timestamp: { order: 'desc' } }],
      }),
      signal: undefined,
    });
  });

  it('quotes connector IDs in the KQL filter', () => {
    expect(buildInboundWebhookExecutionLogFilter('connector-1')).toBe(
      'kibana.action.id: "connector-1" and kibana.action.type_id: ".inboundWebhook"'
    );
  });
});
