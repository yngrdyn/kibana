/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient } from '@kbn/scout';

const XSRF = { 'kbn-xsrf': 'scout-workflows' };
const CONNECTOR_NAME = 'scout-workflows-gen-ai';

/**
 * Ensures a `.gen-ai` connector exists so Agent Builder embeddable chat access
 * resolves successfully. Proposal tests only need connector presence — they
 * inject YAML changes via `__wfTestBridge`, not live LLM calls.
 */
export async function ensureGenAiConnector(kbnClient: KbnClient): Promise<{ id: string }> {
  const list = await kbnClient.request<Array<{ id: string; name: string }>>({
    method: 'GET',
    path: '/api/actions/connectors',
    headers: XSRF,
  });
  const connectors = Array.isArray(list.data) ? list.data : [];
  const existing = connectors.find((connector) => connector.name === CONNECTOR_NAME);
  if (existing) {
    return { id: existing.id };
  }

  const res = await kbnClient.request<{ id: string }>({
    method: 'POST',
    path: '/api/actions/connector',
    headers: XSRF,
    body: {
      name: CONNECTOR_NAME,
      config: {
        apiProvider: 'OpenAI',
        apiUrl: 'http://localhost:9999',
        defaultModel: 'gpt-4',
      },
      secrets: { apiKey: 'scout-test-key' },
      connector_type_id: '.gen-ai',
    },
  });
  return { id: res.data.id };
}

export async function deleteGenAiConnector(
  kbnClient: KbnClient,
  connectorId: string
): Promise<void> {
  await kbnClient.request({
    method: 'DELETE',
    path: `/api/actions/connector/${encodeURIComponent(connectorId)}`,
    headers: XSRF,
  });
}
