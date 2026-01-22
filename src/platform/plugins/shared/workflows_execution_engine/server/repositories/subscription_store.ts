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
import { validateWhereClause } from '../utils/validate_where_clause';
// eslint-disable-next-line @kbn/imports/no_boundary_crossing
import { stepSchemas } from '../../../workflows_management/common/step_schemas';
import type { TriggerDefinition } from '@kbn/workflows-extensions/server';

/**
 * Event subscription document structure
 */
export interface EventSubscription {
  id: string;
  workflowId: string;
  triggerType: string;
  spaceId: string;
  where?: string; // KQL query to filter events
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
  where?: string; // KQL query to filter events
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
   * @throws Error if where clause is invalid or uses properties not in the event schema
   */
  public async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<EventSubscription> {
    // Validate where clause if present
    if (params.where) {
      const registeredTriggers = stepSchemas.getAllRegisteredTriggers();
      const trigger = registeredTriggers.find((t: TriggerDefinition) => t.id === params.triggerType);
      
      if (!trigger || !trigger.eventSchema) {
        throw new Error(
          `Cannot validate where clause: trigger "${params.triggerType}" not found or has no event schema`
        );
      }

      const validation = validateWhereClause(params.where, trigger.eventSchema);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    const now = new Date().toISOString();
    const subscription: EventSubscription = {
      id: generateUuid(),
      workflowId: params.workflowId,
      triggerType: params.triggerType,
      spaceId: params.spaceId,
      where: params.where,
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
   * Update a subscription (enable/disable, update trigger type, or update where clause).
   *
   * @param subscriptionId - The subscription ID
   * @param updates - Partial subscription updates
   * @returns Promise that resolves when the subscription has been updated
   * @throws Error if where clause is invalid or uses properties not in the event schema
   */
  public async updateSubscription(
    subscriptionId: string,
    updates: Partial<Pick<EventSubscription, 'enabled' | 'triggerType' | 'where'>>
  ): Promise<void> {
    // Validate where clause if being updated
    if (updates.where !== undefined) {
      // Get the subscription to find the trigger type
      const subscription = await this.getSubscriptionById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      const triggerType = updates.triggerType || subscription.triggerType;
      const registeredTriggers = stepSchemas.getAllRegisteredTriggers();
      const trigger = registeredTriggers.find((t: TriggerDefinition) => t.id === triggerType);
      
      if (!trigger || !trigger.eventSchema) {
        throw new Error(
          `Cannot validate where clause: trigger "${triggerType}" not found or has no event schema`
        );
      }

      const validation = validateWhereClause(updates.where, trigger.eventSchema);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

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
