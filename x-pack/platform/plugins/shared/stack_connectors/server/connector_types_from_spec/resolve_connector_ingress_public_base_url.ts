/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';

export interface ResolveConnectorIngressPublicBaseUrlParams {
  /** Prefer `server.publicBaseUrl` when configured (already includes server base path). */
  publicBaseUrl?: string;
  serverBasePath: string;
  request: KibanaRequest;
  serverInfo: {
    protocol: string;
    hostname: string;
    port: number;
  };
}

/**
 * Absolute Kibana origin used when minting connector ingress URLs.
 * Prefers `server.publicBaseUrl`, then the request Host header, then listen address.
 */
export const resolveConnectorIngressPublicBaseUrl = ({
  publicBaseUrl,
  serverBasePath,
  request,
  serverInfo,
}: ResolveConnectorIngressPublicBaseUrlParams): string => {
  if (publicBaseUrl) {
    return publicBaseUrl.replace(/\/$/, '');
  }

  const rawProto = request.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(rawProto)
    ? rawProto[rawProto.length - 1]
    : rawProto;
  const host = typeof request.headers.host === 'string' ? request.headers.host : undefined;

  if (host) {
    return `${forwardedProto ?? 'http'}://${host}${serverBasePath}`;
  }

  const { protocol, hostname, port } = serverInfo;
  return `${protocol}://${hostname}:${port}${serverBasePath}`;
};
