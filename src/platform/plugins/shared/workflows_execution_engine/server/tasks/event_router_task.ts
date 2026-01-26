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
import { z } from '@kbn/zod';
import type { WorkflowInput } from '@kbn/workflows/spec/schema';

const WORKFLOW_INDEX_NAME = '.workflows-workflows';

/**
 * Projects event payload to workflow inputs based on workflow's input definitions.
 * 
 * Only needed for external.event triggers, which have nested payload structure:
 * {
 *   source: "slack",
 *   type: "message.posted",
 *   payload: {
 *     channel: "...",
 *     text: "...",
 *     ...
 *   }
 * }
 * 
 * For other triggers (e.g., workflow.execution.failed), the payload is already
 * in the correct shape and doesn't need projection.
 * 
 * If workflow defines inputs like:
 * - name: channel, type: string
 * - name: text, type: string
 * 
 * This function extracts values from event.payload.payload and maps them to inputs.
 */
function projectEventToInputs(
  eventPayload: Record<string, any>,
  inputs: WorkflowInput[],
  triggerType: string
): Record<string, any> {
  const projectedInputs: Record<string, any> = {};
  
  // Only project for external.event triggers (nested payload structure)
  // For other triggers, use eventPayload directly
  const dataSource = triggerType === 'external.event' 
    ? (eventPayload.payload || eventPayload)
    : eventPayload;
  
  for (const input of inputs) {
    const value = dataSource[input.name];
    
    if (value !== undefined) {
      projectedInputs[input.name] = value;
    } else if (input.default !== undefined) {
      // Use default value if input not found in event
      projectedInputs[input.name] = input.default;
    } else if (input.required) {
      // Required input is missing and no default - will fail validation
      projectedInputs[input.name] = undefined;
    }
  }
  
  return projectedInputs;
}

/**
 * Builds a Zod schema from workflow input definitions for validation.
 */
function buildInputsValidationSchema(inputs: WorkflowInput[]): z.ZodObject<any> {
  const schemaFields: Record<string, z.ZodTypeAny> = {};
  
  for (const input of inputs) {
    let fieldSchema: z.ZodTypeAny;
    
    switch (input.type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'choice':
        if (input.options && input.options.length > 0) {
          fieldSchema = z.enum(input.options as [string, ...string[]]);
        } else {
          fieldSchema = z.string();
        }
        break;
      case 'array':
        // Arrays can be string[], number[], or boolean[]
        // We'll use a union to allow any of these
        fieldSchema = z.union([
          z.array(z.string()),
          z.array(z.number()),
          z.array(z.boolean()),
        ]);
        break;
      default:
        fieldSchema = z.any();
    }
    
    // Apply required/optional
    if (input.required) {
      schemaFields[input.name] = fieldSchema;
    } else {
      schemaFields[input.name] = fieldSchema.optional();
    }
  }
  
  return z.object(schemaFields);
}

/**
 * Validates projected inputs against workflow input schema.
 */
function validateInputs(
  inputs: Record<string, any>,
  schema: z.ZodObject<any>,
  logger: Logger
): { isValid: boolean; error?: string } {
  try {
    schema.parse(inputs);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      logger.warn(`Input validation failed: ${errorMessages}. Inputs: ${JSON.stringify(inputs, null, 2)}`);
      return { isValid: false, error: errorMessages };
    }
    return { isValid: false, error: String(error) };
  }
}

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
                // Evaluate where clause if present
                if (subscription.where) {
                  const { evaluateKql } = await import('../utils/eval_kql/eval_kql');
                  const { WorkflowTemplatingEngine } = await import('../templating_engine');
                  
                  // Build context for template rendering and KQL evaluation
                  // Similar to if_step condition, we provide event as the context
                  // Users must reference event.workflowId (explicit access only, no direct access)
                  const context = {
                    event: event.payload,
                  };
                  
                  // Render templates in the where clause (same as if_step condition)
                  const templateEngine = new WorkflowTemplatingEngine();
                  const renderedWhere = templateEngine.render(subscription.where, context);
                  
                  // Evaluate the rendered condition as KQL (same as if_step)
                  let matches = false;
                  if (typeof renderedWhere === 'boolean') {
                    matches = renderedWhere;
                  } else if (typeof renderedWhere === 'string') {
                    // Evaluate KQL against the context (which includes event payload)
                    matches = evaluateKql(renderedWhere, context);
                  } else if (typeof renderedWhere === 'undefined') {
                    matches = false;
                  } else {
                    throw new Error(
                      `Invalid where clause type for subscription ${subscription.id}. ` +
                      `Got ${JSON.stringify(renderedWhere)} (type: ${typeof renderedWhere}), ` +
                      `but expected boolean or string (KQL expression).`
                    );
                  }
                  
                  if (!matches) {
                    logger.debug(
                      `Event router task: Event ${event.id} does not match where clause for subscription ${subscription.id}: ${subscription.where}`
                    );
                    continue;
                  }
                  logger.debug(
                    `Event router task: Event ${event.id} matches where clause for subscription ${subscription.id}`
                  );
                }

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

                if (!workflow.definition) {
                  continue;
                }

                const workflowModel = toWorkflowExecutionModel(workflow);
                const workflowDefinition = workflow.definition; // Type narrowing helper

                // Project event payload to workflow inputs (if workflow defines inputs)
                let workflowInputs: Record<string, unknown>;
                let validationError: string | undefined;
                
                if (workflowDefinition.inputs && workflowDefinition.inputs.length > 0) {
                  // Project event payload to match workflow input definitions
                  // Only external.event triggers need projection (nested payload structure)
                  workflowInputs = projectEventToInputs(
                    event.payload, 
                    workflowDefinition.inputs,
                    event.triggerType
                  );
                  
                  // Validate projected inputs against workflow input schema
                  const validationSchema = buildInputsValidationSchema(workflowDefinition.inputs);
                  const validation = validateInputs(workflowInputs, validationSchema, logger);
                  
                  // Store validation result to use during execution
                  if (!validation.isValid) {
                    validationError = validation.error;
                  }
                } else {
                  // No inputs defined, pass event payload directly
                  workflowInputs = event.payload;
                }

                // Prepare execution context
                const context: Record<string, unknown> = {
                  spaceId: subscription.spaceId,
                  triggeredBy: event.triggerType, 
                  source: 'task-manager', 
                  event: event.payload,
                  inputs: workflowInputs,
                };

                // If validation failed, add error to context so workflow can fail immediately
                // This ensures users see a failed execution record in the UI
                if (validationError) {
                  context.__inputValidationError = validationError;
                  context.__inputValidationFailed = true;
                }

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
                
                // Ensure authorization header is preserved from systemRequest if it exists
                // This is critical for workflows that need to make authenticated requests
                if (systemRequest?.headers?.authorization) {
                  const authHeader = systemRequest.headers.authorization;
                  headers.authorization = Array.isArray(authHeader) ? authHeader[0] : String(authHeader);
                }
                
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
