/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { createDelegatedInboundWebhookExecutionRequest } from './create_delegated_execution_request';

describe('createDelegatedInboundWebhookExecutionRequest', () => {
  it('returns a scoped request from the active mapping credentials', async () => {
    const getAuthorizationHeader = jest.fn().mockReturnValue('ApiKey abc123');
    const getForConnector = jest.fn().mockResolvedValue([
      {
        attributes: {
          payload: {
            status: 'active',
            credentialRevision: 'rev-1',
            secrets: { apiKey: 'abc123' },
          },
        },
      },
    ]);

    const request = await createDelegatedInboundWebhookExecutionRequest(
      {
        getApiKeyService: () => ({ getAuthorizationHeader }) as never,
        getMappingRepository: () => ({ getForConnector }) as never,
        namespaceToSpaceId: () => 'default',
      },
      {
        connectorId: 'connector-1',
        credentialRevision: 'rev-1',
        savedObjectsClient: {
          getCurrentNamespace: () => 'default',
        } as SavedObjectsClientContract,
      }
    );

    expect(getForConnector).toHaveBeenCalledWith('connector-1', 'default');
    expect(getAuthorizationHeader).toHaveBeenCalledWith({ apiKey: 'abc123' });
    expect(request?.headers.authorization).toBe('ApiKey abc123');
  });

  it('returns undefined when no active mapping matches the credential revision', async () => {
    const request = await createDelegatedInboundWebhookExecutionRequest(
      {
        getApiKeyService: () => ({ getAuthorizationHeader: jest.fn() }) as never,
        getMappingRepository: () =>
          ({
            getForConnector: jest.fn().mockResolvedValue([
              {
                attributes: {
                  payload: {
                    status: 'pending',
                    credentialRevision: 'rev-1',
                    secrets: { apiKey: 'abc123' },
                  },
                },
              },
            ]),
          }) as never,
        namespaceToSpaceId: () => 'default',
      },
      {
        connectorId: 'connector-1',
        credentialRevision: 'rev-1',
        savedObjectsClient: {
          getCurrentNamespace: () => 'default',
        } as SavedObjectsClientContract,
      }
    );

    expect(request).toBeUndefined();
  });
});
