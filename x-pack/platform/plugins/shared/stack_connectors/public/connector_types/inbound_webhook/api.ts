/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import { INTERNAL_BASE_STACK_CONNECTORS_API_PATH } from '../../../common';

export async function rotateInboundWebhookUrl({
  http,
  connectorId,
}: {
  http: HttpSetup;
  connectorId: string;
}): Promise<{ webhookUrl: string; ingestTokenHash: string }> {
  return http.post(`${INTERNAL_BASE_STACK_CONNECTORS_API_PATH}/inbound_webhook/_rotate_url`, {
    body: JSON.stringify({ connectorId }),
  });
}
