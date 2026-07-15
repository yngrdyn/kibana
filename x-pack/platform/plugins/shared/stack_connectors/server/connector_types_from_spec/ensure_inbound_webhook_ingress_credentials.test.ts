/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';

import {
  buildInboundWebhookUrl,
  ensureInboundWebhookIngressCredentials,
  mintInboundWebhookIngressCredentials,
} from './ensure_inbound_webhook_ingress_credentials';

describe('buildInboundWebhookUrl', () => {
  it('omits space prefix for the default space', () => {
    expect(
      buildInboundWebhookUrl({
        publicBaseUrl: 'https://kibana.example.com',
        spaceId: 'default',
        connectorId: 'conn-1',
        token: 'abc',
      })
    ).toBe('https://kibana.example.com/api/events/v1/inboundWebhook/conn-1?token=abc');
  });

  it('includes space prefix for non-default spaces and strips trailing slash', () => {
    expect(
      buildInboundWebhookUrl({
        publicBaseUrl: 'https://kibana.example.com/kb/',
        spaceId: 'security',
        connectorId: 'conn-1',
        token: 'abc',
      })
    ).toBe(
      'https://kibana.example.com/kb/s/security/api/events/v1/inboundWebhook/conn-1?token=abc'
    );
  });
});

describe('ensureInboundWebhookIngressCredentials', () => {
  const logger = loggingSystemMock.createLogger();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps verified credentials from rotate-URL on create', () => {
    const minted = mintInboundWebhookIngressCredentials({
      connectorId: 'conn-1',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
    });
    const config: Record<string, unknown> = { ...minted };

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'conn-1',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: false,
      logger,
    });

    expect(config).toEqual(minted);
  });

  it('canonicalizes host for verified rotate credentials on create', () => {
    const token = 'a'.repeat(64);
    const config: Record<string, unknown> = {
      webhookUrl: `https://evil.example/api/events/v1/inboundWebhook/conn-1?token=${token}`,
      ingestTokenHash: computeIngestTokenHash({
        connectorId: 'conn-1',
        spaceId: 'default',
        token,
      }),
    };

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'conn-1',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: false,
      logger,
    });

    expect(config.webhookUrl).toBe(
      `https://kibana.example.com/api/events/v1/inboundWebhook/conn-1?token=${token}`
    );
    expect(config.ingestTokenHash).toBe(
      computeIngestTokenHash({
        connectorId: 'conn-1',
        spaceId: 'default',
        token,
      })
    );
  });

  it('remints on create when client-supplied credentials do not verify', () => {
    const config: Record<string, unknown> = {
      webhookUrl: 'https://evil.example/api/events/v1/inboundWebhook/conn-1?token=client-token',
      ingestTokenHash: 'a'.repeat(64),
    };

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'conn-1',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: false,
      logger,
    });

    expect(config.webhookUrl).toMatch(
      /^https:\/\/kibana\.example\.com\/api\/events\/v1\/inboundWebhook\/conn-1\?token=[a-f0-9]{64}$/
    );
    expect(config.webhookUrl).not.toContain('client-token');
    const token = new URL(String(config.webhookUrl)).searchParams.get('token')!;
    expect(config.ingestTokenHash).toBe(
      computeIngestTokenHash({
        connectorId: 'conn-1',
        spaceId: 'default',
        token,
      })
    );
  });

  it('remints on create when connector id no longer matches rotated URL', () => {
    const minted = mintInboundWebhookIngressCredentials({
      connectorId: 'old-id',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
    });
    const config: Record<string, unknown> = { ...minted };

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'new-id',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: false,
      logger,
    });

    expect(String(config.webhookUrl)).toContain('/inboundWebhook/new-id?');
    expect(config.webhookUrl).not.toBe(minted.webhookUrl);
  });

  it('preserves existing credentials on update', () => {
    const config: Record<string, unknown> = {
      webhookUrl: 'https://kibana.example.com/api/events/v1/inboundWebhook/conn-1?token=keep-me',
      ingestTokenHash: computeIngestTokenHash({
        connectorId: 'conn-1',
        spaceId: 'default',
        token: 'keep-me',
      }),
    };
    const original = { ...config };

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'conn-1',
      spaceId: 'default',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: true,
      logger,
    });

    expect(config).toEqual(original);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('remints on update when credentials are missing', () => {
    const config: Record<string, unknown> = {};

    ensureInboundWebhookIngressCredentials({
      config,
      connectorId: 'conn-1',
      spaceId: 'team-a',
      publicBaseUrl: 'https://kibana.example.com',
      isUpdate: true,
      logger,
    });

    expect(config.webhookUrl).toContain('/s/team-a/api/events/v1/inboundWebhook/conn-1?token=');
    expect(typeof config.ingestTokenHash).toBe('string');
    expect(logger.warn).toHaveBeenCalled();
  });
});
