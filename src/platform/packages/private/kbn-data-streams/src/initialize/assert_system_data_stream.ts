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
 * Thrown when fail-closed assert finds `system` !== true (used to scope rollback).
 * Transient GET failures must not use this type.
 */
export class SystemDataStreamAssertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemDataStreamAssertError';
    Object.setPrototypeOf(this, SystemDataStreamAssertError.prototype);
  }
}

const DEFERRED_SETUP_TIP: Record<'lazyCreation' | 'initializeTemplate', string> = {
  lazyCreation: 'Use lazyCreation: false so create and assert share one boot path.',
  initializeTemplate:
    'Use DataStreamClient.initialize({ lazyCreation: false }) (or core initializeClient) instead.',
};

/**
 * Throws when a privileged stream would defer create+assert (lazy / template-only).
 */
export function rejectDeferredPrivilegedSetup(
  dataStream: AnyDataStreamDefinition,
  reason: 'lazyCreation' | 'initializeTemplate'
): void {
  if (!dataStream.requiresSystemDataStream) {
    return;
  }

  throw new Error(
    `Data stream "${dataStream.name}" requires a system data stream and cannot defer creation (${reason}). ` +
      DEFERRED_SETUP_TIP[reason]
  );
}

/**
 * Re-reads GET _data_stream and checks `system: true` when requiresSystemDataStream.
 * @param failClosed - throw (create-this-call); otherwise warn and continue (pre-existing).
 */
export async function assertSystemDataStream({
  logger,
  dataStream,
  elasticsearchClient,
  failClosed,
}: {
  logger: Logger;
  dataStream: AnyDataStreamDefinition;
  elasticsearchClient: ElasticsearchClient;
  failClosed: boolean;
}): Promise<void> {
  if (!dataStream.requiresSystemDataStream) {
    return;
  }

  const resolved = await getExistingDataStream(elasticsearchClient, dataStream.name, logger);

  if (!resolved) {
    return;
  }

  if (resolved.system === true) {
    return;
  }

  const message =
    `Data stream "${dataStream.name}" requires system: true (requiresSystemDataStream), ` +
    `but Elasticsearch reports system: ${String(resolved.system)}. ` +
    `Register a SystemDataStreamDescriptor in Elasticsearch, or set requiresSystemDataStream: false. ` +
    `See https://github.com/elastic/security-team/issues/18291`;

  if (failClosed) {
    throw new SystemDataStreamAssertError(message);
  }

  logger.warn(`${message} Stream already existed; continuing. Recreate after ES registration.`);
}
