/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import { BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
import type { ConnectorExecutorResult } from '../lib/rewrite_response_body';
import { rewriteResponseToCamelCase } from '../lib/rewrite_response_body';

export async function getIncidentTypes({
  http,
  signal,
  connectorId,
}: {
  http: HttpSetup;
  signal: AbortSignal;
  connectorId: string;
}): Promise<Record<string, any>> {
  const res = await http.post<ConnectorExecutorResult<unknown>>(
    `${BASE_ACTION_API_PATH}/connector/${encodeURIComponent(connectorId)}/_execute`,
    {
      body: JSON.stringify({
        params: { subAction: 'incidentTypes', subActionParams: {} },
      }),
      signal,
    }
  );
  return rewriteResponseToCamelCase(res);
}

export async function getSeverity({
  http,
  signal,
  connectorId,
}: {
  http: HttpSetup;
  signal: AbortSignal;
  connectorId: string;
}): Promise<Record<string, any>> {
  const res = await http.post<ConnectorExecutorResult<unknown>>(
    `${BASE_ACTION_API_PATH}/connector/${encodeURIComponent(connectorId)}/_execute`,
    {
      body: JSON.stringify({
        params: { subAction: 'severity', subActionParams: {} },
      }),
      signal,
    }
  );
  return rewriteResponseToCamelCase(res);
}
