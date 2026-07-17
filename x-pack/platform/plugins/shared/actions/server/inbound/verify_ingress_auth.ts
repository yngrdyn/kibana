/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { timingSafeEqual } from 'node:crypto';

import { computeIngestTokenHash } from '@kbn/connector-specs/src/inbound_webhook/compute_ingest_token_hash';

export const extractIngestToken = ({
  query,
  headers,
}: {
  query: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}): string | undefined => {
  const queryToken = query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  if (Array.isArray(queryToken) && typeof queryToken[0] === 'string' && queryToken[0].length > 0) {
    return queryToken[0];
  }

  const authorization = headers.authorization;
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (typeof headerValue !== 'string') {
    return undefined;
  }
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return bearerMatch?.[1];
};

export const verifyIngestToken = ({
  connectorId,
  spaceId,
  providedToken,
  ingestTokenHash,
}: {
  connectorId: string;
  spaceId: string;
  providedToken: string;
  ingestTokenHash: string;
}): boolean => {
  const expectedHash = computeIngestTokenHash({ connectorId, spaceId, token: providedToken });
  if (expectedHash.length !== ingestTokenHash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(ingestTokenHash));
};
