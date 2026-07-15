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

import {
  type AsApiContract,
  type IExecutionLogResult,
  INTERNAL_BASE_ACTION_API_PATH,
} from '@kbn/actions-plugin/common';
import type { HttpSetup } from '@kbn/core/public';

export const INBOUND_WEBHOOK_EXECUTION_LOG_LOOKBACK = '90d';
export const INBOUND_WEBHOOK_EXECUTION_LOG_LIMIT = 5;

export const buildInboundWebhookExecutionLogFilter = (connectorId: string): string =>
  [
    `kibana.action.id: ${JSON.stringify(connectorId)}`,
    'kibana.action.type_id: ".inboundWebhook"',
  ].join(' and ');

export const loadInboundWebhookExecutionLogs = async ({
  http,
  connectorId,
  signal,
}: {
  http: HttpSetup;
  connectorId: string;
  signal?: AbortSignal;
}): Promise<AsApiContract<IExecutionLogResult>> =>
  http.post<AsApiContract<IExecutionLogResult>>(
    `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_logs`,
    {
      body: JSON.stringify({
        date_start: INBOUND_WEBHOOK_EXECUTION_LOG_LOOKBACK,
        filter: buildInboundWebhookExecutionLogFilter(connectorId),
        per_page: INBOUND_WEBHOOK_EXECUTION_LOG_LIMIT,
        page: 1,
        sort: [{ timestamp: { order: 'desc' } }],
      }),
      signal,
    }
  );
