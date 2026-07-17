/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';

import { resolveConnectorIngressPublicBaseUrl } from './resolve_connector_ingress_public_base_url';

describe('resolveConnectorIngressPublicBaseUrl', () => {
  const serverInfo = {
    protocol: 'http',
    hostname: '0.0.0.0',
    port: 5601,
  };

  it('prefers configured publicBaseUrl', () => {
    const request = httpServerMock.createKibanaRequest({
      headers: { host: 'ignored.example:5601' },
    });

    expect(
      resolveConnectorIngressPublicBaseUrl({
        publicBaseUrl: 'https://kibana.example.com/kb/',
        serverBasePath: '/kb',
        request,
        serverInfo,
      })
    ).toBe('https://kibana.example.com/kb');
  });

  it('falls back to request host when publicBaseUrl is unset', () => {
    const request = httpServerMock.createKibanaRequest({
      headers: { host: 'localhost:5601', 'x-forwarded-proto': 'https' },
    });

    expect(
      resolveConnectorIngressPublicBaseUrl({
        serverBasePath: '',
        request,
        serverInfo,
      })
    ).toBe('https://localhost:5601');
  });

  it('appends serverBasePath when deriving from the request host', () => {
    const request = httpServerMock.createKibanaRequest({
      headers: { host: 'localhost:5601' },
    });

    expect(
      resolveConnectorIngressPublicBaseUrl({
        serverBasePath: '/kb',
        request,
        serverInfo,
      })
    ).toBe('http://localhost:5601/kb');
  });

  it('falls back to server listen address when host header is missing', () => {
    const request = httpServerMock.createKibanaRequest({ headers: {} });

    expect(
      resolveConnectorIngressPublicBaseUrl({
        serverBasePath: '',
        request,
        serverInfo: { protocol: 'http', hostname: '127.0.0.1', port: 5601 },
      })
    ).toBe('http://127.0.0.1:5601');
  });
});
