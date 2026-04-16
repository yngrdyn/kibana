/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { allocateSequencesForChanges, sequenceCounterDocumentId } from './sequence_allocator';

describe('sequenceCounterDocumentId', () => {
  it('returns a stable hex id for the same inputs', () => {
    const a = sequenceCounterDocumentId({
      spaceId: 'default',
      module: 'security',
      dataset: 'rules',
      objectType: 'alerting-rule',
      objectId: 'abc',
    });
    const b = sequenceCounterDocumentId({
      spaceId: 'default',
      module: 'security',
      dataset: 'rules',
      objectType: 'alerting-rule',
      objectId: 'abc',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when any key component changes', () => {
    const base = {
      spaceId: 'default',
      module: 'security',
      dataset: 'rules',
      objectType: 'alerting-rule',
      objectId: 'abc',
    };
    const ids = new Set([
      sequenceCounterDocumentId(base),
      sequenceCounterDocumentId({ ...base, spaceId: 'other' }),
      sequenceCounterDocumentId({ ...base, module: 'other' }),
      sequenceCounterDocumentId({ ...base, dataset: 'other' }),
      sequenceCounterDocumentId({ ...base, objectType: 'other' }),
      sequenceCounterDocumentId({ ...base, objectId: 'other' }),
    ]);
    expect(ids.size).toBe(6);
  });
});

describe('allocateSequencesForChanges retry behavior', () => {
  const createStatusError = (statusCode: number) =>
    ({
      meta: {
        statusCode,
      },
    } as unknown as Error);

  const createMockEsClient = () =>
    ({
      get: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    } as unknown as ElasticsearchClient);

  const baseParams = {
    spaceId: 'default',
    module: 'workflows',
    dataset: 'management',
    refresh: false as const,
    changes: [{ objectType: 'workflow', objectId: 'wf-42', after: { name: 'WF' } }],
  };

  it('retries when update hits version conflict (stale read collision)', async () => {
    const esClient = createMockEsClient();
    const getMock = esClient.get as unknown as jest.Mock;
    const updateMock = esClient.update as unknown as jest.Mock;

    getMock
      .mockResolvedValueOnce({
        _source: { seq: 7 },
        _seq_no: 10,
        _primary_term: 1,
      })
      .mockResolvedValueOnce({
        _source: { seq: 8 },
        _seq_no: 11,
        _primary_term: 1,
      });
    updateMock
      .mockRejectedValueOnce(createStatusError(409))
      .mockResolvedValueOnce({ get: { _source: { seq: 9 } } });

    const result = await allocateSequencesForChanges(esClient, baseParams);
    expect(result).toEqual([9]);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      if_seq_no: 10,
      if_primary_term: 1,
      doc: { seq: 8 },
    });
    expect(updateMock.mock.calls[1][0]).toMatchObject({
      if_seq_no: 11,
      if_primary_term: 1,
      doc: { seq: 9 },
    });
  });

  it('retries when create collides with another writer creating first', async () => {
    const esClient = createMockEsClient();
    const getMock = esClient.get as unknown as jest.Mock;
    const createMock = esClient.create as unknown as jest.Mock;
    const updateMock = esClient.update as unknown as jest.Mock;

    getMock.mockRejectedValueOnce(createStatusError(404)).mockResolvedValueOnce({
      _source: { seq: 1 },
      _seq_no: 5,
      _primary_term: 1,
    });
    createMock.mockRejectedValueOnce(createStatusError(409));
    updateMock.mockResolvedValueOnce({ get: { _source: { seq: 2 } } });

    const result = await allocateSequencesForChanges(esClient, baseParams);
    expect(result).toEqual([2]);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
