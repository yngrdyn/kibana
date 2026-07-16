/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  INBOUND_WEBHOOK_DELEGATED_API_KEY_ID_CONFIG,
  INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET,
  INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_ID_CONFIG,
  INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET,
} from '@kbn/connector-specs';
import type { KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';

export {
  INBOUND_WEBHOOK_DELEGATED_API_KEY_ID_CONFIG as DELEGATED_API_KEY_ID_CONFIG,
  INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET as DELEGATED_API_KEY_SECRET,
  INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_ID_CONFIG as DELEGATED_UIAM_API_KEY_ID_CONFIG,
  INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET as DELEGATED_UIAM_API_KEY_SECRET,
};

export interface InboundWebhookDelegatedCredentials {
  [INBOUND_WEBHOOK_DELEGATED_API_KEY_ID_CONFIG]: string;
  [INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_ID_CONFIG]?: string;
  secrets: {
    [INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET]: string;
    [INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET]?: string;
  };
}

export class InboundWebhookApiKeyService {
  constructor(private readonly security: SecurityServiceStart, private readonly logger: Logger) {}

  public async grant(
    request: KibanaRequest,
    connectorId: string
  ): Promise<InboundWebhookDelegatedCredentials> {
    const apiKeys = this.security.authc.apiKeys;
    if (!(await apiKeys.areAPIKeysEnabled())) {
      throw new Error('API keys are disabled');
    }

    const user = this.security.authc.getCurrentUser(request);
    if (!user) {
      throw new Error('Cannot create an inbound webhook without an authenticated user');
    }

    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    const isUiamRequest = authorizationHeader ? isUiamCredential(authorizationHeader) : false;
    const keyName = `Inbound webhook: ${connectorId}`;

    const esResult =
      user.authentication_type === 'api_key' && !isUiamRequest
        ? await apiKeys.cloneAsInternalUser(request, { name: keyName })
        : await apiKeys.grantAsInternalUser(request, {
            name: keyName,
            role_descriptors: {},
          });
    if (!esResult) {
      throw new Error('Failed to create an API key for the inbound webhook');
    }

    const encodedApiKey =
      'encoded' in esResult && typeof esResult.encoded === 'string'
        ? esResult.encoded
        : Buffer.from(`${esResult.id}:${esResult.api_key}`).toString('base64');

    let uiamResult: { id: string; api_key: string } | null = null;
    if (apiKeys.uiam && isUiamRequest) {
      uiamResult = await apiKeys.uiam.grant(request, { name: keyName });
    }

    return {
      [INBOUND_WEBHOOK_DELEGATED_API_KEY_ID_CONFIG]: esResult.id,
      ...(uiamResult ? { [INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_ID_CONFIG]: uiamResult.id } : {}),
      secrets: {
        [INBOUND_WEBHOOK_DELEGATED_API_KEY_SECRET]: encodedApiKey,
        ...(uiamResult
          ? {
              [INBOUND_WEBHOOK_DELEGATED_UIAM_API_KEY_SECRET]: Buffer.from(
                `${uiamResult.id}:${uiamResult.api_key}`
              ).toString('base64'),
            }
          : {}),
      },
    };
  }

  public async invalidate(params: {
    apiKeyId?: string;
    uiamApiKeyId?: string;
    uiamApiKey?: string;
  }): Promise<void> {
    if (params.apiKeyId) {
      try {
        await this.security.authc.apiKeys.invalidateAsInternalUser({ ids: [params.apiKeyId] });
      } catch (error) {
        this.logger.warn(`Failed to invalidate inbound webhook API key ${params.apiKeyId}`, {
          error,
        });
      }
    }

    if (!params.uiamApiKeyId || !params.uiamApiKey || !this.security.authc.apiKeys.uiam) {
      return;
    }
    try {
      const [, value] = Buffer.from(params.uiamApiKey, 'base64').toString().split(':');
      const request = kibanaRequestFactory({
        headers: { authorization: `ApiKey ${value}` },
      });
      await this.security.authc.apiKeys.uiam.invalidate(request, {
        id: params.uiamApiKeyId,
      });
    } catch (error) {
      this.logger.warn(`Failed to invalidate inbound webhook UIAM API key ${params.uiamApiKeyId}`, {
        error,
      });
    }
  }
}
