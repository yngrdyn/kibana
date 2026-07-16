/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomBytes } from 'node:crypto';

import { buildConnectorIngressEventsPath } from '@kbn/connector-specs';
import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';
import type { Logger } from '@kbn/logging';

export interface ConnectorIngressCredentials {
  readonly ingestTokenHash: string;
  readonly webhookUrl: string;
}

const buildConnectorIngressUrl = ({
  publicBaseUrl,
  spaceId,
  connectorTypeId,
  connectorId,
  token,
}: {
  publicBaseUrl: string;
  spaceId: string;
  connectorTypeId: string;
  connectorId: string;
  token: string;
}): string => {
  const base = publicBaseUrl.replace(/\/$/, '');
  if (!base || !/^https?:\/\//i.test(base)) {
    throw new Error(
      'Cannot mint connector ingress URL without an absolute Kibana public base URL. Configure server.publicBaseUrl.'
    );
  }
  const spacePrefix = spaceId !== 'default' ? `/s/${encodeURIComponent(spaceId)}` : '';
  const ingressPath = buildConnectorIngressEventsPath({ connectorTypeId, connectorId });
  return `${base}${spacePrefix}${ingressPath}?token=${token}`;
};

export const mintConnectorIngressCredentials = ({
  connectorTypeId,
  connectorId,
  spaceId,
  publicBaseUrl,
}: {
  connectorTypeId: string;
  connectorId: string;
  spaceId: string;
  publicBaseUrl: string;
}): ConnectorIngressCredentials => {
  const token = randomBytes(32).toString('hex');
  return {
    ingestTokenHash: computeIngestTokenHash({ connectorId, spaceId, token }),
    webhookUrl: buildConnectorIngressUrl({
      publicBaseUrl,
      spaceId,
      connectorTypeId,
      connectorId,
      token,
    }),
  };
};

/** Returns the token when URL + hash were minted for this connector type/id/space. */
const getVerifiedIngestToken = ({
  webhookUrl,
  ingestTokenHash,
  connectorTypeId,
  connectorId,
  spaceId,
}: {
  webhookUrl: unknown;
  ingestTokenHash: unknown;
  connectorTypeId: string;
  connectorId: string;
  spaceId: string;
}): string | undefined => {
  if (typeof webhookUrl !== 'string' || typeof ingestTokenHash !== 'string') {
    return undefined;
  }

  try {
    const url = new URL(webhookUrl);
    const expectedPathEnd = buildConnectorIngressEventsPath({ connectorTypeId, connectorId });
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
  credentials: ConnectorIngressCredentials
): void => {
  config.ingestTokenHash = credentials.ingestTokenHash;
  config.webhookUrl = credentials.webhookUrl;
};

export const ensureConnectorIngressCredentials = ({
  config,
  connectorTypeId,
  connectorId,
  spaceId,
  publicBaseUrl,
  isUpdate,
  logger,
}: {
  config: Record<string, unknown>;
  connectorTypeId: string;
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
      connectorTypeId,
      connectorId,
      spaceId,
    });
    if (token) {
      config.webhookUrl = buildConnectorIngressUrl({
        publicBaseUrl,
        spaceId,
        connectorTypeId,
        connectorId,
        token,
      });
      return;
    }
    applyCredentials(
      config,
      mintConnectorIngressCredentials({ connectorTypeId, connectorId, spaceId, publicBaseUrl })
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
    `Connector ingress credentials missing on update for connector ${connectorId} (${connectorTypeId}); minting new credentials`
  );
  applyCredentials(
    config,
    mintConnectorIngressCredentials({ connectorTypeId, connectorId, spaceId, publicBaseUrl })
  );
};
