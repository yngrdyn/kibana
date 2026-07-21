/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import type { AnyDataStreamDefinition } from '../types';
import { initializeDataStream } from './data_stream';
import { initializeIndexTemplate } from './index_template';
import { getExistingDataStream, getExistingIndexTemplate } from './exists_checks';
import { assertSystemDataStream } from './assert_system_data_stream';

/**
 * https://www.elastic.co/docs/manage-data/data-store/data-streams/set-up-data-stream
 *
 * Endeavour to be idempotent and race-condition safe.
 */
export async function initialize({
  logger,
  dataStream,
  elasticsearchClient,
  lazyCreation,
}: {
  logger: Logger;
  dataStream: AnyDataStreamDefinition;
  elasticsearchClient: ElasticsearchClient;
  lazyCreation?: boolean;
}) {
  logger = logger.get('data-streams-setup');
  logger.debug(`Setting up index template for data stream: ${dataStream.name}`);

  if (!dataStream.name) {
    throw new Error('Data stream name is required');
  }

  const existingDataStream = await getExistingDataStream(
    elasticsearchClient,
    dataStream.name,
    logger
  );
  const existingIndexTemplate = await getExistingIndexTemplate(
    elasticsearchClient,
    dataStream.name,
    logger
  );

  // The index template is created and updated in all cases except if the data stream does not exist and we will not create it now.
  const createIndexTemplateIfDoesntExist = existingDataStream ? true : !lazyCreation;
  // create the data stream only if not lazy.
  const createDataStreamIfDoesntExist = !lazyCreation;

  const { uptoDate: indexTemplateReady } = await initializeIndexTemplate({
    logger,
    dataStream,
    elasticsearchClient,
    existingIndexTemplate,
    skipCreation: !createIndexTemplateIfDoesntExist,
  });

  const { uptoDate: dataStreamReady } = await initializeDataStream({
    logger,
    dataStream,
    elasticsearchClient,
    existingDataStream,
    existingIndexTemplate,
    skipCreation: !createDataStreamIfDoesntExist,
  });

  // Fail closed when a privileged stream is missing its ES SystemDataStreamDescriptor.
  // Callers that set requiresSystemDataStream should use lazyCreation: false so the stream
  // exists and can be verified (assert throws if the stream is absent or system !== true).
  await assertSystemDataStream({ logger, dataStream, elasticsearchClient });

  return {
    dataStreamReady: indexTemplateReady && dataStreamReady,
  };
}
