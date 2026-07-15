/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { httpServerMock, httpServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';

import { rotateInboundWebhookUrlRoute } from './rotate_inbound_webhook_url';

describe('rotateInboundWebhookUrlRoute', () => {
  const logger = loggingSystemMock.createLogger();

  const setup = () => {
    const router = httpServiceMock.createRouter();
    const ensureAuthorized = jest.fn().mockResolvedValue(undefined);
    const getStartServices = jest.fn().mockResolvedValue([
      {},
      {
        actions: {
          getActionsAuthorizationWithRequest: () => ({ ensureAuthorized }),
        },
      },
    ]);

    rotateInboundWebhookUrlRoute({
      router,
      getStartServices,
      getPublicBaseUrl: () => 'https://kibana.example.com',
      getSpaceId: () => 'default',
      logger,
    });

    const [config, handler] = router.post.mock.calls[0];
    return { config, handler, ensureAuthorized };
  };

  it('registers the internal rotate URL path', () => {
    const { config } = setup();
    expect(config.path).toBe('/internal/stack_connectors/inbound_webhook/_rotate_url');
  });

  it('returns minted credentials when authorized', async () => {
    const { handler, ensureAuthorized } = setup();
    const res = httpServerMock.createResponseFactory();
    const req = httpServerMock.createKibanaRequest({
      body: { connectorId: 'my-connector' },
    });

    await handler({}, req, res);

    expect(ensureAuthorized).toHaveBeenCalledWith({
      operation: 'create',
      actionTypeId: '.inboundWebhook',
    });
    expect(res.ok).toHaveBeenCalled();
    const body = res.ok.mock.calls[0][0]?.body as {
      webhookUrl: string;
      ingestTokenHash: string;
    };
    expect(body.webhookUrl).toMatch(
      /^https:\/\/kibana\.example\.com\/api\/events\/v1\/inboundWebhook\/my-connector\?token=[a-f0-9]{64}$/
    );
    const token = new URL(body.webhookUrl).searchParams.get('token')!;
    expect(body.ingestTokenHash).toBe(
      computeIngestTokenHash({
        connectorId: 'my-connector',
        spaceId: 'default',
        token,
      })
    );
  });

  it('returns 400 for invalid connector ids', async () => {
    const { handler } = setup();
    const res = httpServerMock.createResponseFactory();
    const req = httpServerMock.createKibanaRequest({
      body: { connectorId: 'Not Valid' },
    });

    await handler({}, req, res);

    expect(res.badRequest).toHaveBeenCalled();
  });

  it('returns forbidden when authorization fails', async () => {
    const { handler, ensureAuthorized } = setup();
    ensureAuthorized.mockRejectedValue(Boom.forbidden('Unauthorized'));
    const res = httpServerMock.createResponseFactory();
    const req = httpServerMock.createKibanaRequest({
      body: { connectorId: 'my-connector' },
    });

    await handler({}, req, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 })
    );
  });
});
