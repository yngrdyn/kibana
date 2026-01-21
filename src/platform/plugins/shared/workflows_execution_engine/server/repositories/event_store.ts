/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { WorkflowEvent } from '@kbn/workflows-extensions/server';

export class EventStore {
  private readonly indexName = '.workflows-events-poc';

  constructor(private readonly esClient: ElasticsearchClient) {}

  /**
   * Persist an event to the event store.
   * This is typically called by the emitEvent API in workflows_extensions.
   *
   * @param event - The event document to persist
   * @returns Promise that resolves when the event has been indexed
   */
  public async persistEvent(event: WorkflowEvent): Promise<void> {
    await this.esClient.index({
      index: this.indexName,
      id: event.id,
      refresh: false, // Don't wait for refresh for better performance
      document: event,
    });
  }

  /**
   * Claim pending events for processing.
   * Atomically updates events from PENDING to PROCESSING status.
   * Uses optimistic locking with version numbers to ensure atomicity.
   *
   * @param batchSize - Maximum number of events to claim (default: 10)
   * @returns Promise that resolves to an array of claimed events
   */
  public async claimPendingEvents(batchSize: number = 10): Promise<WorkflowEvent[]> {
    const searchResponse = await this.esClient.search<WorkflowEvent>({
      index: this.indexName,
      query: {
        term: { status: 'PENDING' },
      },
      size: batchSize,
      sort: [{ timestamp: { order: 'asc' } }], // Process oldest first
    });

    if (searchResponse.hits.hits.length === 0) {
      return [];
    }

    // Attempt to update each event atomically using version numbers
    const claimedEvents: WorkflowEvent[] = [];

    for (const hit of searchResponse.hits.hits) {
      const event = hit._source as WorkflowEvent;

      try {
        const now = new Date().toISOString();
        await this.esClient.update({
          index: this.indexName,
          id: event.id,
          if_seq_no: hit._seq_no,
          if_primary_term: hit._primary_term,
          refresh: false,
          doc: {
            status: 'PROCESSING',
            processingStartedAt: now,
          },
        });

        claimedEvents.push({ ...event, status: 'PROCESSING', processingStartedAt: now });
      } catch (error: any) {
        // If version conflict, skip this event (another process claimed it)
        if (error.meta?.body?.error?.type !== 'version_conflict_engine_exception') {
          // Re-throw if it's not a version conflict
          throw error;
        }
      }
    }

    await this.esClient.indices.refresh({ index: this.indexName });

    return claimedEvents;
  }

  /**
   * Mark an event as completed.
   *
   * @param eventId - The ID of the event to mark as completed
   * @returns Promise that resolves when the event has been updated
   */
  public async markEventCompleted(eventId: string): Promise<void> {
    await this.esClient.update({
      index: this.indexName,
      id: eventId,
      refresh: true,
      doc: {
        status: 'COMPLETED',
      },
    });
  }

  /**
   * Get an event by ID.
   *
   * @param eventId - The ID of the event to retrieve
   * @returns Promise that resolves to the event document, or null if not found
   */
  public async getEventById(eventId: string): Promise<WorkflowEvent | null> {
    try {
      const response = await this.esClient.get<WorkflowEvent>({
        index: this.indexName,
        id: eventId,
      });

      return response._source as WorkflowEvent;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search events with a custom query.
   *
   * @param query - The Elasticsearch query object (optional, defaults to match_all)
   * @param size - Maximum number of results to return (default: 100)
   * @param from - Offset for pagination (default: 0)
   * @param sort - Sort order (default: sort by timestamp descending)
   * @returns Promise that resolves to an array of events
   */
  public async searchEvents(
    query?: Record<string, unknown>,
    size: number = 100,
    from: number = 0,
    sort: Array<Record<string, { order: 'asc' | 'desc' }>> = [{ timestamp: { order: 'desc' } }]
  ): Promise<WorkflowEvent[]> {
    const searchQuery = query || { match_all: {} };

    const response = await this.esClient.search<WorkflowEvent>({
      index: this.indexName,
      query: searchQuery,
      size,
      from,
      sort,
    });

    return response.hits.hits.map((hit) => hit._source as WorkflowEvent);
  }

  /**
   * Get all events (convenience method).
   *
   * @param size - Maximum number of results to return (default: 1000)
   * @returns Promise that resolves to an array of all events
   */
  public async getAllEvents(size: number = 1000): Promise<WorkflowEvent[]> {
    return this.searchEvents(undefined, size);
  }

  /**
   * Reclaim stale PROCESSING events that have been stuck for too long.
   * This handles cases where Kibana restarted while processing an event.
   *
   * @param staleThresholdMinutes - Events in PROCESSING status older than this (in minutes) will be reclaimed (default: 5)
   * @param batchSize - Maximum number of stale events to reclaim (default: 10)
   * @returns Promise that resolves to an array of reclaimed events
   */
  public async reclaimStaleProcessingEvents(
    staleThresholdMinutes: number = 5,
    batchSize: number = 10
  ): Promise<WorkflowEvent[]> {
    const staleThreshold = new Date();
    staleThreshold.setMinutes(staleThreshold.getMinutes() - staleThresholdMinutes);

    // Build query - handle both events with and without processingStartedAt
    const query: any = {
      bool: {
        must: [{ term: { status: 'PROCESSING' } }],
        should: [
          {
            bool: {
              must_not: {
                exists: {
                  field: 'processingStartedAt',
                },
              },
            },
          },
          {
            bool: {
              must: [
                {
                  exists: {
                    field: 'processingStartedAt',
                  },
                },
                {
                  range: {
                    processingStartedAt: {
                      lt: staleThreshold.toISOString(),
                    },
                  },
                },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    };

    const searchResponse = await this.esClient.search<WorkflowEvent>({
      index: this.indexName,
      query,
      size: batchSize,
      sort: [{ timestamp: { order: 'asc' } }], // Sort by timestamp (always exists)
    });

    if (searchResponse.hits.hits.length === 0) {
      return [];
    }

    // Attempt to reclaim each stale event atomically
    const reclaimedEvents: WorkflowEvent[] = [];

    for (const hit of searchResponse.hits.hits) {
      const event = hit._source as WorkflowEvent;

      try {
        // Reset to PENDING status and clear processingStartedAt
        // This allows the event to be claimed again
        await this.esClient.update({
          index: this.indexName,
          id: event.id,
          if_seq_no: hit._seq_no,
          if_primary_term: hit._primary_term,
          refresh: false,
          script: {
            source: 'ctx._source.status = "PENDING"; ctx._source.remove("processingStartedAt");',
            lang: 'painless',
          },
        });

        reclaimedEvents.push({ ...event, status: 'PENDING', processingStartedAt: undefined });
      } catch (error: any) {
        // If version conflict, skip this event (another process reclaimed it)
        if (error.meta?.body?.error?.type !== 'version_conflict_engine_exception') {
          // Re-throw if it's not a version conflict
          throw error;
        }
      }
    }

    await this.esClient.indices.refresh({ index: this.indexName });

    return reclaimedEvents;
  }
}
