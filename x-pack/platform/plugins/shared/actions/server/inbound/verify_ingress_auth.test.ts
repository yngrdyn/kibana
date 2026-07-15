/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeIngestTokenHash } from '@kbn/connector-specs';

import { extractIngestToken, verifyIngestToken } from './verify_ingress_auth';

describe('verifyIngestToken', () => {
  it('accepts matching query token', () => {
    const token = 'a'.repeat(64);
    const hash = computeIngestTokenHash({
      connectorId: 'connector-1',
      spaceId: 'default',
      token,
    });

    expect(
      verifyIngestToken({
        connectorId: 'connector-1',
        spaceId: 'default',
        providedToken: token,
        ingestTokenHash: hash,
      })
    ).toBe(true);
  });

  it('rejects invalid token', () => {
    expect(
      verifyIngestToken({
        connectorId: 'connector-1',
        spaceId: 'default',
        providedToken: 'wrong-token',
        ingestTokenHash: computeIngestTokenHash({
          connectorId: 'connector-1',
          spaceId: 'default',
          token: 'expected-token',
        }),
      })
    ).toBe(false);
  });

  it('extracts bearer authorization token', () => {
    expect(
      extractIngestToken({
        query: {},
        headers: { authorization: 'Bearer my-token' },
      })
    ).toBe('my-token');
  });
});
