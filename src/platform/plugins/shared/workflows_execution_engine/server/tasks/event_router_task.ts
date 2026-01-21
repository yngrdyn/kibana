/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { CoreStart } from '@kbn/core-lifecycle-server';
import type { WorkflowsExecutionEnginePluginStart } from '../types';
import { EventStore } from '../repositories/event_store';
import { SubscriptionStore } from '../repositories/subscription_store';
import type { EsWorkflow, WorkflowExecutionEngineModel } from '@kbn/workflows';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';

const WORKFLOW_INDEX_NAME = '.workflows-workflows';

async function loadWorkflow(
  esClient: ElasticsearchClient,
  workflowId: string,
  spaceId: string,
  logger: Logger
): Promise<EsWorkflow | null> {
  try {
    const response = await esClient.search({
      index: WORKFLOW_INDEX_NAME,
      query: {
        bool: {
          must: [
            { ids: { values: [workflowId] } },
            { term: { spaceId } },
            { bool: { must_not: { exists: { field: 'deleted_at' } } } }, // Exclude soft-deleted
          ],
        },
      },
      size: 1,
    });

    if (response.hits.hits.length === 0) {
      logger.warn(`Workflow ${workflowId} not found in space ${spaceId}`);
      return null;
    }

    const hit = response.hits.hits[0];
    const source = hit._source as any;
    const workflow: EsWorkflow = {
      id: hit._id || source.id,
      name: source.name,
      description: source.description,
      enabled: source.enabled,
      tags: source.tags || [],
      createdAt: source.created_at ? new Date(source.created_at) : new Date(),
      createdBy: source.createdBy,
      lastUpdatedAt: source.updated_at ? new Date(source.updated_at) : new Date(),
      lastUpdatedBy: source.lastUpdatedBy || source.createdBy,
      definition: source.definition,
      deleted_at: source.deleted_at ? new Date(source.deleted_at) : null,
      yaml: source.yaml,
      valid: source.valid ?? true,
    };

    // Validate workflow
    if (!workflow.enabled) {
      logger.warn(`Workflow ${workflowId} is disabled`);
      return null;
    }

    if (!workflow.valid) {
      logger.warn(`Workflow ${workflowId} is not valid`);
      return null;
    }

    if (!workflow.definition) {
      logger.warn(`Workflow ${workflowId} has no definition`);
      return null;
    }

    return workflow;
  } catch (error) {
    logger.error(`Failed to load workflow ${workflowId}: ${error}`);
    return null;
  }
}

/**
 * Convert EsWorkflow to WorkflowExecutionEngineModel.
 */
function toWorkflowExecutionModel(workflow: EsWorkflow): WorkflowExecutionEngineModel {
  return {
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    definition: workflow.definition!,
    yaml: workflow.yaml,
  };
}

/**
 * Event router task runner.
 * Polls for PENDING events, claims them, finds subscriptions, and schedules workflow executions.
 */
export function createEventRouterTaskRunner({
  core,
  logger,
  workflowsExecutionEngine,
  eventStore,
  systemRequest,
  encryptedSavedObjects,
}: {
  core: CoreStart;
  logger: Logger;
  workflowsExecutionEngine: Pick<WorkflowsExecutionEnginePluginStart, 'executeWorkflow'>;
  eventStore: EventStore;
  systemRequest: KibanaRequest;
  encryptedSavedObjects?: {
    getClient: (options?: { includedHiddenTypes?: string[] }) => {
      getDecryptedAsInternalUser: <T = any>(type: string, id: string, options?: { namespace?: string }) => Promise<{ attributes: T }>;
    };
  };
}) {
  if (!systemRequest) {
    throw new Error('systemRequest is required for event router task');
  }
  
  const subscriptionStore = new SubscriptionStore(
    core.elasticsearch.client.asInternalUser
  );
  
  return {
    run: async () => {
      try {
        logger.debug('Event router task: Starting event processing cycle');

        const staleEvents = await eventStore.reclaimStaleProcessingEvents(5, 10); // 5 minutes threshold
        if (staleEvents.length > 0) {
          logger.info(
            `Event router task: Reclaimed ${staleEvents.length} stale PROCESSING event(s)`
          );
        }

        const claimedEvents = await eventStore.claimPendingEvents(10);

        if (claimedEvents.length === 0) {
          logger.debug('Event router task: No pending events to process');
          return;
        }

        logger.info(`Event router task: Claimed ${claimedEvents.length} events for processing`);

        for (const event of claimedEvents) {
          try {
            const subscriptions = await subscriptionStore.findSubscriptions(
              event.triggerType,
              event.spaceId
            );

            if (subscriptions.length === 0) {
              logger.debug(
                `Event router task: No subscriptions found for trigger ${event.triggerType} in space ${event.spaceId}`
              );
              await eventStore.markEventCompleted(event.id);
              continue;
            }

            logger.info(
              `Event router task: Found ${subscriptions.length} subscription(s) for event ${event.id}`
            );

            const esClient = core.elasticsearch.client.asInternalUser;
            
            for (const subscription of subscriptions) {
              try {
                logger.debug(
                  `Event router task: Loading workflow ${subscription.workflowId} for event ${event.id}`
                );

                const workflow = await loadWorkflow(
                  esClient,
                  subscription.workflowId,
                  subscription.spaceId,
                  logger
                );

                if (!workflow) {
                  logger.warn(
                    `Event router task: Workflow ${subscription.workflowId} not found or invalid. Skipping.`
                  );
                  continue;
                }

                const workflowModel = toWorkflowExecutionModel(workflow);

                // Prepare execution context
                // Pass event.payload as workflow inputs
                const context: Record<string, unknown> = {
                  spaceId: subscription.spaceId,
                  triggeredBy: event.triggerType, 
                  source: 'task-manager', 
                  event: event.payload,
                  inputs: event.payload,
                };

                const { kibanaRequestFactory } = await import('@kbn/core-http-server-utils');

                const sourceHeaders = systemRequest?.headers || {};
                const headers: Record<string, string> = {
                  ...Object.fromEntries(
                    Object.entries(sourceHeaders).map(([key, value]) => [
                      key,
                      Array.isArray(value) ? value[0] : String(value),
                    ])
                  ),
                  'kbn-system-request': 'true',
                  'x-elastic-internal-origin': 'Kibana',
                };
                
                // If event has an API key ID, retrieve the API key value from EncryptedSavedObjects
                logger.debug(
                  `Event ${event.id} credentialRef: ${JSON.stringify(event.credentialRef)}, hasEncryptedSO: ${!!encryptedSavedObjects}`
                );
                
                if (event.credentialRef?.apiKeyId && encryptedSavedObjects) {
                  try {
                    logger.debug(
                      `Attempting to retrieve API key for event ${event.id} from EncryptedSavedObjects`
                    );
                    const encryptedClient = encryptedSavedObjects.getClient({
                      includedHiddenTypes: ['workflow-event-api-key'],
                    });

                    const namespace = subscription.spaceId !== 'default' ? subscription.spaceId : undefined;
                    logger.debug(
                      `Retrieving API key for event ${event.id} with namespace: ${namespace || 'undefined (default)'}`
                    );
                    
                    const apiKeyDoc = await encryptedClient.getDecryptedAsInternalUser<{
                      apiKey: string;
                      apiKeyId: string;
                    }>(
                      'workflow-event-api-key',
                      event.id,
                      namespace ? { namespace } : undefined
                    );
                    
                    if (apiKeyDoc?.attributes?.apiKey) {
                      const { apiKeyId, apiKey: apiKeyValue } = apiKeyDoc.attributes;
                      const encoded = Buffer.from(`${apiKeyId}:${apiKeyValue}`).toString('base64');
                      headers.authorization = `ApiKey ${encoded}`;
                      logger.info(
                        `Successfully retrieved and using API key from EncryptedSavedObjects for event ${event.id} (workflow: ${subscription.workflowId})`
                      );
                    } else {
                      logger.warn(
                        `API key document retrieved but apiKey attribute is missing for event ${event.id}`
                      );
                    }
                  } catch (error) {
                    logger.error(
                      `Failed to retrieve API key for event ${event.id}: ${error instanceof Error ? error.message : String(error)}. Workflow execution may fail without authentication.`
                    );
                  }
                } else {
                  if (!event.credentialRef?.apiKeyId) {
                    logger.warn(
                      `Event ${event.id} does not have apiKeyId in credentialRef. CredentialRef: ${JSON.stringify(event.credentialRef)}`
                    );
                  }
                  if (!encryptedSavedObjects) {
                    logger.warn(
                      `EncryptedSavedObjects not available for event ${event.id}, cannot retrieve API key`
                    );
                  }
                }
                
                const fakeRawRequest = {
                  headers,
                  path: '/',
                };
                const requestForExecution = kibanaRequestFactory(fakeRawRequest);
                core.http.basePath.set(requestForExecution, `/s/${subscription.spaceId}`);

                logger.info(
                  `Event router task: Executing workflow ${subscription.workflowId} for event ${event.id}`
                );

                // Execute the workflow
                await workflowsExecutionEngine.executeWorkflow(
                  workflowModel,
                  context,
                  requestForExecution
                );

                logger.info(
                  `Event router task: Successfully executed workflow ${subscription.workflowId} for event ${event.id}`
                );
              } catch (error) {
                logger.error(
                  `Event router task: Failed to execute workflow ${subscription.workflowId} for event ${event.id}: ${error}`
                );
              }
            }

            await eventStore.markEventCompleted(event.id);
            logger.debug(`Event router task: Marked event ${event.id} as completed`);
          } catch (error) {
            logger.error(`Event router task: Failed to process event ${event.id}: ${error}`);
          }
        }

        logger.debug('Event router task: Completed event processing cycle');
      } catch (error) {
        logger.error(`Event router task: Error in event processing cycle: ${error}`);
        throw error;
      }
    },
  };
}
