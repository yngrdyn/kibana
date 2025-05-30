/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Either from 'fp-ts/Either';
import * as TaskEither from 'fp-ts/TaskEither';
import { pipe } from 'fp-ts/function';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { RetryableEsClientError } from './catch_retryable_es_client_errors';
import { DEFAULT_TIMEOUT, type SourceEqualsTarget, type IndexNotFound } from '.';
import { setWriteBlock } from './set_write_block';

/** @internal */
export interface SafeWriteBlockParams {
  client: ElasticsearchClient;
  sourceIndex: string;
  targetIndex: string;
  timeout?: string;
}

export const safeWriteBlock = ({
  client,
  sourceIndex,
  targetIndex,
  timeout = DEFAULT_TIMEOUT,
}: SafeWriteBlockParams): TaskEither.TaskEither<
  SourceEqualsTarget | IndexNotFound | RetryableEsClientError,
  'set_write_block_succeeded'
> => {
  const assertSourceAndTargetDifferTask: TaskEither.TaskEither<
    SourceEqualsTarget,
    'source_and_target_differ'
  > = TaskEither.fromEither(
    sourceIndex === targetIndex
      ? Either.left({ type: 'source_equals_target' as const, index: sourceIndex })
      : Either.right('source_and_target_differ' as const)
  );

  return pipe(
    assertSourceAndTargetDifferTask,
    TaskEither.chainW(() => setWriteBlock({ client, index: sourceIndex, timeout }))
  );
};
