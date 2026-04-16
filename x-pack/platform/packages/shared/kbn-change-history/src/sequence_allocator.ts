/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Refresh } from '@elastic/elasticsearch/lib/api/types';
import { SEQUENCE_COUNTER_INDEX, SEPARATOR_CHAR } from './constants';
import { sha256 } from './utils';
import type { ObjectChange } from './types';

/** Stable document id for the per-object sequence counter. */
export function sequenceCounterDocumentId(parts: {
  spaceId: string;
  module: string;
  dataset: string;
  objectType: string;
  objectId: string;
}): string {
  const key = [parts.spaceId, parts.module, parts.dataset, parts.objectType, parts.objectId].join(
    SEPARATOR_CHAR
  );
  return sha256(key);
}

interface SequenceCounterSource {
  seq: number;
}

const SEQUENCE_ALLOCATION_MAX_ATTEMPTS = 20;

function getResponseHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return (error as { meta?: { statusCode?: number } }).meta?.statusCode;
}

/**
 * Advances the per-object counter with **optimistic concurrency** on a single Elasticsearch
 * document: **read `_seq_no` / `_primary_term`**, then **`update` with `if_seq_no` /
 * `if_primary_term`**. If the document is missing (**404**), **`create`** it (first writer).
 * **409** conflicts (concurrent create or stale read) trigger a bounded retry loop.
 */
async function incrementSequenceCounter(
  elasticsearchClient: ElasticsearchClient,
  documentId: string,
  delta: number,
  refresh: Refresh | undefined
): Promise<number> {
  for (let attempt = 0; attempt < SEQUENCE_ALLOCATION_MAX_ATTEMPTS; attempt++) {
    try {
      const getRes = await elasticsearchClient.get<SequenceCounterSource>({
        index: SEQUENCE_COUNTER_INDEX,
        id: documentId,
      });

      const currentSeq = getRes._source?.seq;
      if (typeof currentSeq !== 'number' || !Number.isFinite(currentSeq)) {
        throw new Error(
          `Change history counter document [${documentId}] has invalid seq: ${String(currentSeq)}`
        );
      }

      const newSeq = currentSeq + delta;
      const updateRes = await elasticsearchClient.update<SequenceCounterSource>({
        index: SEQUENCE_COUNTER_INDEX,
        id: documentId,
        refresh,
        if_seq_no: getRes._seq_no,
        if_primary_term: getRes._primary_term,
        doc: { seq: newSeq },
        _source: true,
      });

      const seq = (updateRes.get?._source as SequenceCounterSource | undefined)?.seq;
      if (typeof seq !== 'number' || !Number.isFinite(seq)) {
        throw new Error(
          `Change history sequence counter update did not return seq for document [${documentId}]`
        );
      }
      return seq;
    } catch (error: unknown) {
      const status = getResponseHttpStatus(error);

      if (status === 404) {
        try {
          await elasticsearchClient.create({
            index: SEQUENCE_COUNTER_INDEX,
            id: documentId,
            refresh,
            document: { seq: delta },
          });
          return delta;
        } catch (createError: unknown) {
          const createStatus = getResponseHttpStatus(createError);
          if (createStatus !== 409) {
            throw createError;
          }
        }
      } else if (status !== 409) {
        throw error;
      }
    }
  }

  throw new Error(
    `Change history: could not allocate sequence for counter document [${documentId}] after ${SEQUENCE_ALLOCATION_MAX_ATTEMPTS} attempts (concurrent writers)`
  );
}

export async function ensureSequenceCounterIndex(
  elasticsearchClient: ElasticsearchClient
): Promise<void> {
  const exists = await elasticsearchClient.indices.exists({ index: SEQUENCE_COUNTER_INDEX });
  if (exists) {
    return;
  }
  try {
    await elasticsearchClient.indices.create({
      index: SEQUENCE_COUNTER_INDEX,
      settings: {
        hidden: true,
        number_of_shards: 1,
        auto_expand_replicas: '0-1',
      },
      mappings: {
        dynamic: false,
        properties: {
          seq: { type: 'long' },
        },
      },
    });
  } catch (err: unknown) {
    // Concurrent startup may race on create
    const status = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
    if (status === 400 || status === 409) {
      const stillExists = await elasticsearchClient.indices.exists({
        index: SEQUENCE_COUNTER_INDEX,
      });
      if (stillExists) {
        return;
      }
    }
    throw err;
  }
}

/**
 * Allocates the next monotonic `object.sequence` for each change (same order as `changes`),
 * keyed by `(spaceId, module, dataset, objectType, objectId)`.
 */
export async function allocateSequencesForChanges(
  elasticsearchClient: ElasticsearchClient,
  params: {
    spaceId: string;
    module: string;
    dataset: string;
    changes: ObjectChange[];
    refresh: Refresh | undefined;
  }
): Promise<number[]> {
  const { spaceId, module, dataset, changes, refresh } = params;
  if (changes.length === 0) {
    return [];
  }

  const countsByDocId = new Map<string, number>();
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const docId = sequenceCounterDocumentId({
      spaceId,
      module,
      dataset,
      objectType: change.objectType,
      objectId: change.objectId,
    });
    countsByDocId.set(docId, (countsByDocId.get(docId) ?? 0) + 1);
  }

  const endSeqByDocId = new Map<string, number>();
  for (const [docId, delta] of countsByDocId) {
    const end = await incrementSequenceCounter(elasticsearchClient, docId, delta, refresh);
    endSeqByDocId.set(docId, end);
  }

  const cursorByDocId = new Map<string, number>();
  for (const [docId, delta] of countsByDocId) {
    const end = endSeqByDocId.get(docId)!;
    cursorByDocId.set(docId, end - delta + 1);
  }

  const result: number[] = new Array(changes.length);
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const docId = sequenceCounterDocumentId({
      spaceId,
      module,
      dataset,
      objectType: change.objectType,
      objectId: change.objectId,
    });
    const next = cursorByDocId.get(docId)!;
    result[i] = next;
    cursorByDocId.set(docId, next + 1);
  }

  return result;
}
