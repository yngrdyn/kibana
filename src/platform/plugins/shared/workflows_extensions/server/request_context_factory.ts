/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, RequestHandlerContext, Logger } from '@kbn/core/server';
import type { EmitEventResult } from './emit_event';
import { emitEvent } from './emit_event';
import type { TriggerRegistry } from './trigger_registry';

export interface WorkflowsExtensionsApiRequestHandlerContext {
  /**
   * Emit an event into the event store.
   * The kibanaRequest is automatically injected from the context.
   *
   * @param triggerType - The trigger type identifier
   * @param payload - The event payload (must match the trigger's schema)
   * @returns Promise that resolves to the event ID
   * @throws Error if trigger is unknown or payload validation fails
   */
  emitEvent(
    triggerType: string,
    payload: Record<string, any>
  ): Promise<EmitEventResult>;
}

interface ConstructorOptions {
  logger: Logger;
  triggerRegistry: TriggerRegistry;
  getEmitEventOptions: () => {
    esClient: any;
    spaces?: any;
    indexName: string;
    security?: any;
    encryptedSavedObjects?: any;
    savedObjects?: any;
  };
}

export class RequestContextFactory {
  constructor(private readonly options: ConstructorOptions) {}

  public async create(
    context: RequestHandlerContext,
    request: KibanaRequest
  ): Promise<WorkflowsExtensionsApiRequestHandlerContext> {
    const { options } = this;
    const { triggerRegistry, getEmitEventOptions } = options;

    const emitEventOptions = getEmitEventOptions();

    return {
      emitEvent: async (triggerType: string, payload: Record<string, any>) => {
        return emitEvent(
          {
            triggerType,
            payload,
            kibanaRequest: request,
          },
          {
            triggerRegistry,
            ...emitEventOptions,
            logger: options.logger,
          }
        );
      },
    };
  }
}
