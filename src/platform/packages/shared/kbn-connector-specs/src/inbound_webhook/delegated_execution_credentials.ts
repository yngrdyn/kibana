/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Secret/config field names for delegated Task Manager execution credentials
 * granted when an inbound webhook connector is created (see feature/inbound-webhook).
 */
export const INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET = 'delegatedApiKey' as const;
export const INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET = 'delegatedUiamApiKey' as const;
export const INBOUND_WEBHOOK_DELEGATED_API_KEY_ID_CONFIG = 'delegatedApiKeyId' as const;
export const INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_ID_CONFIG = 'delegatedUiamApiKeyId' as const;

/**
 * Builds an `ApiKey …` Authorization header from inbound-webhook connector secrets.
 * Returns undefined when delegated credentials have not been granted yet.
 */
export function getInboundWebhookAuthorizationHeader(
  secrets: Record<string, unknown>
): string | undefined {
  const uiamApiKey = secrets[INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET];
  if (typeof uiamApiKey === 'string' && uiamApiKey.length > 0) {
    const parts = Buffer.from(uiamApiKey, 'base64').toString().split(':');
    const value = parts[1];
    if (value) {
      return `ApiKey ${value}`;
    }
  }

  const apiKey = secrets[INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `ApiKey ${apiKey}`;
  }
  return undefined;
}
