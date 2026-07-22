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
import {
  assertSystemDataStream,
  rejectDeferredPrivilegedSetup,
  SystemDataStreamAssertError,
} from './assert_system_data_stream';

const rollbackAfterFailedSystemAssert = async ({
  logger,
  elasticsearchClient,
  dataStreamName,
  deleteIndexTemplate,
}: {
  logger: Logger;
  elasticsearchClient: ElasticsearchClient;
  dataStreamName: string;
  deleteIndexTemplate: boolean;
}): Promise<void> => {
  const tryRollback = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      logger.warn(`Rolled back ${label} "${dataStreamName}" after system assert failure`);
    } catch (deleteError) {
      logger.error(`Failed to roll back ${label} "${dataStreamName}": ${deleteError}`);
    }
  };

  await tryRollback('data stream', () =>
    elasticsearchClient.indices.deleteDataStream({ name: dataStreamName })
  );

  if (deleteIndexTemplate) {
    await tryRollback('index template', () =>
      elasticsearchClient.indices.deleteIndexTemplate({ name: dataStreamName })
    );
  }
};

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
  const createdDataStreamThisCall = !existingDataStream && createDataStreamIfDoesntExist;
  const createdIndexTemplateThisCall = !existingIndexTemplate && createIndexTemplateIfDoesntExist;

  if (lazyCreation && !existingDataStream) {
    rejectDeferredPrivilegedSetup(dataStream, 'lazyCreation');
  }

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

  try {
    await assertSystemDataStream({
      logger,
      dataStream,
      elasticsearchClient,
      failClosed: createdDataStreamThisCall,
    });
  } catch (error) {
    // Only roll back on the invariant failure — not on transient GET/network errors.
    if (createdDataStreamThisCall && error instanceof SystemDataStreamAssertError) {
      await rollbackAfterFailedSystemAssert({
        logger,
        elasticsearchClient,
        dataStreamName: dataStream.name,
        deleteIndexTemplate: createdIndexTemplateThisCall,
      });
    }
    throw error;
  }

  return {
    dataStreamReady: indexTemplateReady && dataStreamReady,
  };
}
