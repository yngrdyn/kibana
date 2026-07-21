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
import { getExistingDataStream } from './exists_checks';

/**
 * Fail closed when a definition requires a system data stream (the default) but Elasticsearch
 * has created it as a non-system stream (`system` !== true).
 *
 * Hidden is not sufficient for privilege hardening; only a SystemDataStreamDescriptor makes
 * ES treat the stream as system. Opt out with `requiresSystemDataStream: false`.
 *
 * When the stream does not exist yet (lazy creation), verification is skipped.
 */
export async function assertSystemDataStream({
  logger,
  dataStream,
  elasticsearchClient,
}: {
  logger: Logger;
  dataStream: AnyDataStreamDefinition;
  elasticsearchClient: ElasticsearchClient;
}): Promise<void> {
  // Default is true: only an explicit false opts out.
  if (dataStream.requiresSystemDataStream === false) {
    return;
  }

  const existing = await getExistingDataStream(elasticsearchClient, dataStream.name, logger);

  if (!existing) {
    logger.debug(
      `Skipping system data stream verification for "${dataStream.name}": data stream does not exist yet.`
    );
    return;
  }

  if (existing.system !== true) {
    throw new Error(
      `Data stream "${dataStream.name}" requires a system data stream (requiresSystemDataStream defaults to true), ` +
        `but Elasticsearch reports system: ${String(existing.system)}. ` +
        `Hidden data streams are not privilege-hardened. Register a SystemDataStreamDescriptor for this name in ` +
        `Elasticsearch (e.g. KibanaPlugin), or set requiresSystemDataStream: false if this stream is intentionally ` +
        `non-system. See https://github.com/elastic/security-team/issues/18291`
    );
  }

  logger.debug(
    `Verified data stream "${dataStream.name}" is registered as a system data stream (system: true).`
  );
}
