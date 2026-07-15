/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomBytes } from 'node:crypto';

import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';
import type { Logger } from '@kbn/logging';

export interface InboundWebhookIngressCredentials {
  readonly ingestTokenHash: string;
  readonly webhookUrl: string;
}

export const buildInboundWebhookUrl = ({
  publicBaseUrl,
  spaceId,
  connectorId,
  token,
}: {
  publicBaseUrl: string;
  spaceId: string;
  connectorId: string;
  token: string;
}): string => {
  const base = publicBaseUrl.replace(/\/$/, '');
  const spacePrefix = spaceId !== 'default' ? `/s/${encodeURIComponent(spaceId)}` : '';
  return `${base}${spacePrefix}/api/events/v1/inboundWebhook/${connectorId}?token=${token}`;
};

export const mintInboundWebhookIngressCredentials = ({
  connectorId,
  spaceId,
  publicBaseUrl,
}: {
  connectorId: string;
  spaceId: string;
  publicBaseUrl: string;
}): InboundWebhookIngressCredentials => {
  const token = randomBytes(32).toString('hex');
  return {
    ingestTokenHash: computeIngestTokenHash({ connectorId, spaceId, token }),
    webhookUrl: buildInboundWebhookUrl({ publicBaseUrl, spaceId, connectorId, token }),
  };
};

/** Returns the token when URL + hash were minted for this connectorId/spaceId. */
const getVerifiedIngestToken = ({
  webhookUrl,
  ingestTokenHash,
  connectorId,
  spaceId,
}: {
  webhookUrl: unknown;
  ingestTokenHash: unknown;
  connectorId: string;
  spaceId: string;
}): string | undefined => {
  if (typeof webhookUrl !== 'string' || typeof ingestTokenHash !== 'string') {
    return undefined;
  }

  try {
    const url = new URL(webhookUrl);
    const expectedPathEnd = `/api/events/v1/inboundWebhook/${connectorId}`;
    if (!url.pathname.endsWith(expectedPathEnd)) {
      return undefined;
    }
    if (spaceId !== 'default' && !url.pathname.includes(`/s/${encodeURIComponent(spaceId)}/`)) {
      return undefined;
    }
    const token = url.searchParams.get('token') ?? undefined;
    if (!token || computeIngestTokenHash({ connectorId, spaceId, token }) !== ingestTokenHash) {
      return undefined;
    }
    return token;
  } catch {
    return undefined;
  }
};

const applyCredentials = (
  config: Record<string, unknown>,
  credentials: InboundWebhookIngressCredentials
): void => {
  config.ingestTokenHash = credentials.ingestTokenHash;
  config.webhookUrl = credentials.webhookUrl;
};

export const ensureInboundWebhookIngressCredentials = ({
  config,
  connectorId,
  spaceId,
  publicBaseUrl,
  isUpdate,
  logger,
}: {
  config: Record<string, unknown>;
  connectorId: string;
  spaceId: string;
  publicBaseUrl: string;
  isUpdate: boolean;
  logger: Logger;
}): void => {
  if (!isUpdate) {
    const token = getVerifiedIngestToken({
      webhookUrl: config.webhookUrl,
      ingestTokenHash: config.ingestTokenHash,
      connectorId,
      spaceId,
    });
    if (token) {
      config.webhookUrl = buildInboundWebhookUrl({
        publicBaseUrl,
        spaceId,
        connectorId,
        token,
      });
      return;
    }
    applyCredentials(
      config,
      mintInboundWebhookIngressCredentials({ connectorId, spaceId, publicBaseUrl })
    );
    return;
  }

  if (
    typeof config.ingestTokenHash === 'string' &&
    config.ingestTokenHash.length > 0 &&
    typeof config.webhookUrl === 'string' &&
    config.webhookUrl.length > 0
  ) {
    return;
  }

  logger.warn(
    `Inbound webhook credentials missing on update for connector ${connectorId}; minting new credentials`
  );
  applyCredentials(
    config,
    mintInboundWebhookIngressCredentials({ connectorId, spaceId, publicBaseUrl })
  );
};
