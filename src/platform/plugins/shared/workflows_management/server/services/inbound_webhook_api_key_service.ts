/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';
import type {
  InboundWebhookCredentialSecrets,
  InboundWebhookPayload,
} from '../saved_objects/inbound_webhook';

export type DelegatedWebhookCredentials = Pick<
  InboundWebhookPayload,
  'apiKeyId' | 'uiamApiKeyId' | 'delegatedUsername' | 'delegatedUserProfileId'
> & {
  secrets: Pick<InboundWebhookCredentialSecrets, 'apiKey' | 'uiamApiKey'>;
};

export class InboundWebhookApiKeyService {
  constructor(private readonly security: SecurityServiceStart, private readonly logger: Logger) {}

  public async grant(
    request: KibanaRequest,
    connectorId: string
  ): Promise<DelegatedWebhookCredentials> {
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
    const keyName = `Workflows inbound webhook: ${connectorId}`;

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
      apiKeyId: esResult.id,
      ...(uiamResult ? { uiamApiKeyId: uiamResult.id } : {}),
      delegatedUsername: user.username,
      ...(user.profile_uid ? { delegatedUserProfileId: user.profile_uid } : {}),
      secrets: {
        apiKey: encodedApiKey,
        ...(uiamResult
          ? { uiamApiKey: Buffer.from(`${uiamResult.id}:${uiamResult.api_key}`).toString('base64') }
          : {}),
      },
    };
  }

  public getAuthorizationHeader(secrets: InboundWebhookCredentialSecrets): string {
    if (secrets.uiamApiKey) {
      const [, value] = Buffer.from(secrets.uiamApiKey, 'base64').toString().split(':');
      if (!value || !isUiamCredential(value)) {
        throw new Error('Stored UIAM API key is invalid');
      }
      return `ApiKey ${value}`;
    }
    return `ApiKey ${secrets.apiKey}`;
  }

  public async invalidate(attributes: InboundWebhookPayload): Promise<void> {
    try {
      await this.security.authc.apiKeys.invalidateAsInternalUser({ ids: [attributes.apiKeyId] });
    } catch (error) {
      this.logger.warn(`Failed to invalidate inbound webhook API key ${attributes.apiKeyId}`, {
        error,
      });
    }

    if (!attributes.uiamApiKeyId || !attributes.secrets.uiamApiKey) {
      return;
    }
    try {
      const [, value] = Buffer.from(attributes.secrets.uiamApiKey, 'base64').toString().split(':');
      const request = kibanaRequestFactory({
        headers: { authorization: `ApiKey ${value}` },
      });
      await this.security.authc.apiKeys.uiam?.invalidate(request, {
        id: attributes.uiamApiKeyId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate inbound webhook UIAM API key ${attributes.uiamApiKeyId}`,
        { error }
      );
    }
  }
}
