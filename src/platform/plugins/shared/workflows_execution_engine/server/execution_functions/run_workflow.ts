/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { ExecutionStatus, type EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionError } from '@kbn/workflows/server';
import { setupDependencies } from './setup_dependencies';
import type { WorkflowsExecutionEngineConfig } from '../config';
import type { ContextDependencies } from '../workflow_context_manager/types';
import { workflowExecutionLoop } from '../workflow_execution_loop';

export async function runWorkflow({
  workflowRunId,
  spaceId,
  taskAbortController,
  logger,
  config,
  fakeRequest,
  dependencies,
}: {
  workflowRunId: string;
  spaceId: string;
  taskAbortController: AbortController;
  logger: Logger;
  config: WorkflowsExecutionEngineConfig;
  fakeRequest: KibanaRequest;
  dependencies: ContextDependencies;
}): Promise<void> {
  const {
    workflowRuntime,
    stepExecutionRuntimeFactory,
    workflowExecutionState,
    workflowLogger,
    nodesFactory,
    workflowExecutionGraph,
    workflowTaskManager,
    workflowExecutionRepository,
    esClient,
    stepExecutionRepository,
  } = await setupDependencies(workflowRunId, spaceId, logger, config, dependencies, fakeRequest);

  // Check for input validation errors before starting workflow execution
  // This ensures workflows fail immediately with clear validation error messages
  const workflowExecution = workflowExecutionState.getWorkflowExecution();
  const context = workflowExecution.context as Record<string, unknown> | undefined;
  
  if (context?.__inputValidationFailed && context?.__inputValidationError) {
    // Create a validation error with a special type to prevent retries
    const validationError = new ExecutionError({
      type: 'InputValidationError', // Special error type to identify validation failures
      message: `Input validation failed: ${context.__inputValidationError}. ` +
        `Required inputs are missing or have incorrect types. ` +
        `Please check your workflow inputs match the event payload structure.`,
      details: {
        validationError: context.__inputValidationError,
        nonRetryable: true, // Flag to indicate this error should not be retried
      },
    });
    
    // Set workflow error and status to FAILED BEFORE starting
    // This ensures the execution loop will exit immediately when it checks the status
    workflowRuntime.setWorkflowError(validationError);
    
    const finishedAt = new Date().toISOString();
    // Ensure startedAt is valid - use createdAt or current time as fallback
    let startedAtDate: Date;
    if (workflowExecution.startedAt) {
      startedAtDate = new Date(workflowExecution.startedAt);
      if (isNaN(startedAtDate.getTime())) {
        // Invalid date, use createdAt or current time
        startedAtDate = workflowExecution.createdAt ? new Date(workflowExecution.createdAt) : new Date();
      }
    } else {
      startedAtDate = workflowExecution.createdAt ? new Date(workflowExecution.createdAt) : new Date();
    }
    
    // Ensure startedAt is set on the execution if it wasn't already
    if (!workflowExecution.startedAt) {
      workflowExecutionState.updateWorkflowExecution({
        startedAt: startedAtDate.toISOString(),
      });
    }
    
    const duration = new Date(finishedAt).getTime() - startedAtDate.getTime();
    
    workflowExecutionState.updateWorkflowExecution({
      status: ExecutionStatus.FAILED,
      finishedAt,
      duration: duration >= 0 ? duration : 0, // Ensure non-negative duration
    });
    
    // Call start() to ensure proper initialization (APM tracing, etc.)
    await workflowRuntime.start();
    
    // Persist the FAILED status immediately to ensure execution loop sees it
    await workflowRuntime.saveState();
    await workflowLogger.flushEvents();
    
    // Also persist via repository to ensure it's saved to ES
    // This ensures the status is persisted even if the execution loop is already running
    await workflowExecutionRepository.updateWorkflowExecution({
      id: workflowRunId,
      status: ExecutionStatus.FAILED,
      finishedAt,
      error: validationError.toSerializableObject(),
    });
    
    // Create a synthetic step execution to show validation failure in the UI
    // This helps users understand what went wrong even though no actual steps ran
    const validationStepId = '__input_validation__';
    const validationStepExecutionId = `${workflowRunId}__${validationStepId}__0`;
    // Use the same startedAt/finishedAt as the workflow execution
    const stepStartedAt = startedAtDate;
    const stepFinishedAt = new Date(finishedAt);
    
    // Create a complete step execution with all required fields
    const validationStepExecution: EsWorkflowStepExecution = {
      id: validationStepExecutionId,
      spaceId,
      workflowRunId: workflowRunId, // Ensure this matches the execution ID
      workflowId: workflowExecution.workflowId,
      stepId: validationStepId,
      stepType: 'validation',
      status: ExecutionStatus.FAILED,
      startedAt: stepStartedAt.toISOString(),
      finishedAt: stepFinishedAt.toISOString(),
      executionTimeMs: stepFinishedAt.getTime() - stepStartedAt.getTime(),
      topologicalIndex: -1, // Special index for validation step
      globalExecutionIndex: 0,
      stepExecutionIndex: 0,
      scopeStack: [],
      error: validationError.toSerializableObject(),
      input: JSON.parse(JSON.stringify({
        validationError: String(context.__inputValidationError),
        expectedInputs: workflowExecution.workflowDefinition?.inputs?.map(i => ({
          name: i.name,
          type: i.type,
          required: i.required,
        })) || [],
      })), // Ensure it's a valid JsonValue
    };
    
    try {
      // Use bulkUpsert to save the step execution
      await stepExecutionRepository.bulkUpsert([validationStepExecution]);
      
      // Also try direct index operation as a fallback to ensure it's saved
      try {
        const internalEsClient = dependencies.coreStart.elasticsearch.client.asInternalUser;
        await internalEsClient.index({
          index: '.workflows-step-executions',
          id: validationStepExecutionId,
          document: validationStepExecution,
          refresh: true,
        });
      } catch (indexError) {
        logger.warn(
          `Direct index operation failed (this is OK if bulkUpsert succeeded): ${indexError instanceof Error ? indexError.message : String(indexError)}`
        );
      }
      
      // Wait a moment for Elasticsearch to refresh
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      // Don't throw - we still want the workflow to be marked as failed
    }
    
    return; // Exit early - workflow has failed
  }

  await workflowRuntime.start();

  await workflowExecutionLoop({
    workflowRuntime,
    stepExecutionRuntimeFactory,
    workflowExecutionState,
    workflowExecutionRepository,
    workflowLogger,
    nodesFactory,
    workflowExecutionGraph,
    esClient,
    fakeRequest,
    coreStart: dependencies.coreStart,
    taskAbortController,
    workflowTaskManager,
  });
}
