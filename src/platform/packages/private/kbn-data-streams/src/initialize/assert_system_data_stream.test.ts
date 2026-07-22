/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { errors as EsErrors } from '@elastic/elasticsearch';
import { mappings, type MappingsDefinition } from '@kbn/es-mappings';
import type { DataStreamDefinition } from '../types';
import { assertSystemDataStream, SystemDataStreamAssertError } from './assert_system_data_stream';

describe('assertSystemDataStream', () => {
  let logger: Logger;
  let elasticsearchClient: jest.Mocked<ElasticsearchClient>;

  const testMappings = {
    properties: {
      '@timestamp': mappings.date(),
    },
  } satisfies MappingsDefinition;

  const createDefinition = (
    overrides: Partial<DataStreamDefinition<typeof testMappings>> = {}
  ): DataStreamDefinition<typeof testMappings> => ({
    name: '.kibana_change_history',
    version: 1,
    requiresSystemDataStream: true,
    template: { mappings: testMappings },
    ...overrides,
  });

  const notFoundError = () =>
    new EsErrors.ResponseError({
      statusCode: 404,
      body: { error: { type: 'resource_not_found_exception' } },
      warnings: [],
      headers: {},
      meta: {} as never,
    });

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
    elasticsearchClient = elasticsearchClientMock.createInternalClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when requiresSystemDataStream is false', async () => {
    await assertSystemDataStream({
      logger,
      elasticsearchClient,
      dataStream: createDefinition({ requiresSystemDataStream: false }),
      failClosed: true,
    });

    expect(elasticsearchClient.indices.getDataStream).not.toHaveBeenCalled();
  });

  it('skips verification when the data stream does not exist yet', async () => {
    (elasticsearchClient.indices.getDataStream as jest.Mock).mockRejectedValue(notFoundError());

    await expect(
      assertSystemDataStream({
        logger,
        elasticsearchClient,
        dataStream: createDefinition(),
        failClosed: true,
      })
    ).resolves.toBeUndefined();
  });

  it('succeeds when Elasticsearch reports system: true', async () => {
    (elasticsearchClient.indices.getDataStream as jest.Mock).mockResolvedValue({
      data_streams: [{ name: '.kibana_change_history', system: true, hidden: true }],
    });

    await expect(
      assertSystemDataStream({
        logger,
        elasticsearchClient,
        dataStream: createDefinition(),
        failClosed: true,
      })
    ).resolves.toBeUndefined();
  });

  it('throws when failClosed and Elasticsearch reports system: false', async () => {
    (elasticsearchClient.indices.getDataStream as jest.Mock).mockResolvedValue({
      data_streams: [{ name: '.kibana_change_history', system: false, hidden: true }],
    });

    await expect(
      assertSystemDataStream({
        logger,
        elasticsearchClient,
        dataStream: createDefinition(),
        failClosed: true,
      })
    ).rejects.toBeInstanceOf(SystemDataStreamAssertError);
  });

  it('throws when failClosed and Elasticsearch omits the system flag', async () => {
    (elasticsearchClient.indices.getDataStream as jest.Mock).mockResolvedValue({
      data_streams: [{ name: '.kibana_change_history', hidden: true }],
    });

    await expect(
      assertSystemDataStream({
        logger,
        elasticsearchClient,
        dataStream: createDefinition(),
        failClosed: true,
      })
    ).rejects.toBeInstanceOf(SystemDataStreamAssertError);
  });

  it('warns and continues when not failClosed and Elasticsearch reports system: false', async () => {
    (elasticsearchClient.indices.getDataStream as jest.Mock).mockResolvedValue({
      data_streams: [{ name: '.kibana_change_history', system: false, hidden: true }],
    });

    await expect(
      assertSystemDataStream({
        logger,
        elasticsearchClient,
        dataStream: createDefinition(),
        failClosed: false,
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/system: false/));
  });
});
