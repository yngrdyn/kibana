/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { DataStreamClient } from '@kbn/data-streams';
import { FLAGS } from './constants';
import { ChangeHistoryClient } from './client';

jest.mock('@kbn/data-streams', () => ({
  DataStreamClient: {
    initialize: jest.fn(),
  },
}));

const DataStreamClientMock = DataStreamClient as jest.Mocked<typeof DataStreamClient>;

describe('ChangeHistoryClient.initialize', () => {
  const logger = loggingSystemMock.createLogger();
  const defaultConstructorOpts = {
    module: 'workflows',
    dataset: 'definitions',
    logger,
    kibanaVersion: '9.4.0',
  };

  beforeEach(() => {
    FLAGS.FEATURE_ENABLED = true;
    DataStreamClientMock.initialize.mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes the data stream with DSL lifecycle enabled and infinite retention', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();

    const client = new ChangeHistoryClient(defaultConstructorOpts);
    await client.initialize(esClient);

    expect(esClient.ilm.putLifecycle).not.toHaveBeenCalled();
    expect(esClient.ilm.getLifecycle).not.toHaveBeenCalled();
    expect(DataStreamClientMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        dataStream: expect.objectContaining({
          version: 3,
          template: expect.objectContaining({
            mappings: expect.any(Object),
            lifecycle: { enabled: true },
          }),
        }),
      })
    );
    expect(
      DataStreamClientMock.initialize.mock.calls[0]?.[0].dataStream.template.settings
    ).toBeUndefined();
    expect(client.isInitialized()).toBe(true);
  });

  it('skips initialization when FEATURE_ENABLED is false', async () => {
    FLAGS.FEATURE_ENABLED = false;
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const client = new ChangeHistoryClient(defaultConstructorOpts);

    await client.initialize(esClient);

    expect(DataStreamClientMock.initialize).not.toHaveBeenCalled();
    expect(client.isInitialized()).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      'Change history is disabled. Skipping initialization.'
    );
  });
});

describe('ChangeHistoryClient.logBulk', () => {
  const logger = loggingSystemMock.createLogger();
  const defaultConstructorOpts = {
    module: 'workflows',
    dataset: 'definitions',
    logger,
    kibanaVersion: '9.4.0',
  };

  beforeEach(() => {
    FLAGS.FEATURE_ENABLED = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns without throwing when FEATURE_ENABLED is false', async () => {
    FLAGS.FEATURE_ENABLED = false;
    const client = new ChangeHistoryClient(defaultConstructorOpts);

    await expect(
      client.logBulk(
        [
          {
            objectId: 'wf-1',
            objectType: 'workflow',
            timestamp: new Date().toISOString(),
            snapshot: { yaml: 'name: test' },
          },
        ],
        {
          action: 'workflow_update',
          username: 'elastic',
          spaceId: 'default',
        }
      )
    ).resolves.toBeUndefined();

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('throws when the feature is enabled but the client is not initialized', async () => {
    const client = new ChangeHistoryClient(defaultConstructorOpts);

    await expect(
      client.logBulk(
        [
          {
            objectId: 'wf-1',
            objectType: 'workflow',
            timestamp: new Date().toISOString(),
            snapshot: { yaml: 'name: test' },
          },
        ],
        {
          action: 'workflow_update',
          username: 'elastic',
          spaceId: 'default',
        }
      )
    ).rejects.toThrow(
      'Change history data stream not initialized for: module [workflows] and dataset [definitions]'
    );
  });
});
