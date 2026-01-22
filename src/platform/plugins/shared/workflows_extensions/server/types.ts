/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { CustomRequestHandlerContext } from '@kbn/core/server';
import type { ServerStepDefinition } from './step_registry/types';
import type { TriggerDefinition } from './trigger_registry/types';
import type { WorkflowsExtensionsStartContract } from '../common/types';
import type { EmitEventParams, EmitEventResult } from './emit_event';
import type { WorkflowsExtensionsApiRequestHandlerContext } from './request_context_factory';

/**
 * Server-side plugin setup contract.
 * Exposes methods for other plugins to register server-side custom workflow steps and triggers.
 */
export interface WorkflowsExtensionsServerPluginSetup {
  /**
   * Register server-side definition for a workflow step.
   * This should be called during the plugin's setup phase.
   *
   * @param definition - The step server-side definition
   * @throws Error if definition for the same step type ID is already registered
   */
  registerStepDefinition(definition: ServerStepDefinition): void;

  /**
   * Register a workflow trigger definition.
   * This should be called during the plugin's setup phase.
   *
   * @param definition - The trigger definition
   * @throws Error if a trigger with the same ID is already registered
   */
  registerTrigger(definition: TriggerDefinition): void;
}

/**
 * Server-side plugin start contract.
 * Exposes methods for retrieving registered server-side step implementations and triggers,
 * and for emitting events.
 */
export interface WorkflowsExtensionsServerPluginStart
  extends WorkflowsExtensionsStartContract<ServerStepDefinition, TriggerDefinition> {
  /**
   * Emit an event into the event store.
   * Validates the trigger exists and payload matches schema, then persists to Elasticsearch.
   *
   * @param params - Event emission parameters
   * @returns Promise that resolves to the event ID
   * @throws Error if trigger is unknown or payload validation fails
   */
  emitEvent(params: EmitEventParams): Promise<EmitEventResult>;
}

/**
 * Dependencies for the server plugin setup phase.
 */
export interface WorkflowsExtensionsServerPluginSetupDeps {
  encryptedSavedObjects?: {
    registerType: (params: {
      type: string;
      attributesToEncrypt: Set<string>;
      attributesToIncludeInAAD?: Set<string>;
    }) => void;
  };
}

/**
 * Dependencies for the server plugin start phase.
 */
export interface WorkflowsExtensionsServerPluginStartDeps {
  actions: ActionsPluginStartContract;
  inference: InferenceServerStart;
  spaces?: SpacesPluginStart;
  encryptedSavedObjects?: {
    getClient: (options?: { includedHiddenTypes?: string[] }) => {
      create: (type: string, attributes: any, options?: { id?: string; namespace?: string }) => Promise<any>;
      getDecryptedAsInternalUser: <T = any>(type: string, id: string, options?: { namespace?: string }) => Promise<{ attributes: T }>;
    };
  };
}

/**
 * Request handler context for workflows_extensions plugin.
 * Provides access to the workflows context with emitEvent method.
 */
export type WorkflowsExtensionsPluginRequestHandlerContext = CustomRequestHandlerContext<{
  workflows: WorkflowsExtensionsApiRequestHandlerContext;
}>;
