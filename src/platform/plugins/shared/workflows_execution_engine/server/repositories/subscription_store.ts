/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { WORKFLOWS_SUBSCRIPTIONS_INDEX } from '../../common/mappings';
import { v4 as generateUuid } from 'uuid';

/**
 * Event subscription document structure
 */
export interface EventSubscription {
  id: string;
  workflowId: string;
  triggerType: string;
  spaceId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * Parameters for creating a subscription
 */
export interface CreateSubscriptionParams {
  workflowId: string;
  triggerType: string;
  spaceId: string;
  createdBy?: string;
}

/**
 * Subscription store for managing event subscriptions in Elasticsearch.
 * Provides methods to create, find, update, and delete subscriptions.
 */
export class SubscriptionStore {
  private readonly indexName = WORKFLOWS_SUBSCRIPTIONS_INDEX;

  constructor(private readonly esClient: ElasticsearchClient) {}

  /**
   * Create a new subscription.
   *
   * @param params - Subscription creation parameters
   * @returns Promise that resolves to the created subscription
   */
  public async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<EventSubscription> {
    const now = new Date().toISOString();
    const subscription: EventSubscription = {
      id: generateUuid(),
      workflowId: params.workflowId,
      triggerType: params.triggerType,
      spaceId: params.spaceId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      createdBy: params.createdBy,
    };

    await this.esClient.index({
      index: this.indexName,
      id: subscription.id,
      refresh: true,
      document: subscription,
    });

    return subscription;
  }

  /**
   * Find subscriptions for a specific trigger type and space.
   * Only returns enabled subscriptions.
   *
   * @param triggerType - The trigger type to find subscriptions for
   * @param spaceId - The space ID to filter by
   * @returns Promise that resolves to an array of subscriptions
   */
  public async findSubscriptions(
    triggerType: string,
    spaceId: string
  ): Promise<EventSubscription[]> {
    const response = await this.esClient.search<EventSubscription>({
      index: this.indexName,
      query: {
        bool: {
          must: [
            { term: { triggerType } },
            { term: { spaceId } },
            { term: { enabled: true } },
          ],
        },
      },
      size: 1000, // TODO: Add pagination if needed
    });

    return response.hits.hits.map((hit) => hit._source as EventSubscription);
  }

  /**
   * Get a subscription by ID.
   *
   * @param subscriptionId - The subscription ID
   * @returns Promise that resolves to the subscription, or null if not found
   */
  public async getSubscriptionById(
    subscriptionId: string
  ): Promise<EventSubscription | null> {
    try {
      const response = await this.esClient.get<EventSubscription>({
        index: this.indexName,
        id: subscriptionId,
      });

      return response._source as EventSubscription;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all subscriptions for a workflow.
   *
   * @param workflowId - The workflow ID
   * @param spaceId - The space ID
   * @returns Promise that resolves to an array of subscriptions
   */
  public async getSubscriptionsByWorkflowId(
    workflowId: string,
    spaceId: string
  ): Promise<EventSubscription[]> {
    const response = await this.esClient.search<EventSubscription>({
      index: this.indexName,
      query: {
        bool: {
          must: [
            { term: { workflowId } },
            { term: { spaceId } },
          ],
        },
      },
      size: 1000,
    });

    return response.hits.hits.map((hit) => hit._source as EventSubscription);
  }

  /**
   * Update a subscription (enable/disable or update trigger type).
   *
   * @param subscriptionId - The subscription ID
   * @param updates - Partial subscription updates
   * @returns Promise that resolves when the subscription has been updated
   */
  public async updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<EventSubscription, 'enabled' | 'triggerType'>>
  ): Promise<void> {
    const updateDoc: Partial<EventSubscription> = {
      updatedAt: new Date().toISOString(),
      ...updates,
    };

    await this.esClient.update({
      index: this.indexName,
      id: subscriptionId,
      refresh: true,
      doc: updateDoc,
    });
  }

  /**
   * Delete a subscription.
   *
   * @param subscriptionId - The subscription ID
   * @returns Promise that resolves when the subscription has been deleted
   */
  public async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.esClient.delete({
      index: this.indexName,
      id: subscriptionId,
      refresh: true,
    });
  }

  /**
   * Delete all subscriptions for a workflow.
   *
   * @param workflowId - The workflow ID
   * @param spaceId - The space ID
   * @returns Promise that resolves when all subscriptions have been deleted
   */
  public async deleteSubscriptionsByWorkflowId(
    workflowId: string,
    spaceId: string
  ): Promise<void> {
    // First, find all subscriptions for this workflow
    const subscriptions = await this.getSubscriptionsByWorkflowId(workflowId, spaceId);

    // Delete each subscription
    if (subscriptions.length > 0) {
      await Promise.all(
        subscriptions.map((sub) => this.deleteSubscription(sub.id))
      );
    }
  }

  /**
   * Check if a subscription already exists for a workflow and trigger type.
   *
   * @param workflowId - The workflow ID
   * @param triggerType - The trigger type
   * @param spaceId - The space ID
   * @returns Promise that resolves to the existing subscription, or null if not found
   */
  public async findExistingSubscription(
    workflowId: string,
    triggerType: string,
    spaceId: string
  ): Promise<EventSubscription | null> {
    const response = await this.esClient.search<EventSubscription>({
      index: this.indexName,
      query: {
        bool: {
          must: [
            { term: { workflowId } },
            { term: { triggerType } },
            { term: { spaceId } },
          ],
        },
      },
      size: 1,
    });

    if (response.hits.hits.length === 0) {
      return null;
    }

    return response.hits.hits[0]._source as EventSubscription;
  }
}
