/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { TaskCost, TaskPriority } from '@kbn/task-manager-plugin/server';
import type { InboundWebhookApiKeyService } from '../services/inbound_webhook_api_key_service';
import type { InboundWebhookMappingRepository } from '../storage/inbound_webhook_mapping_repository';

export const INBOUND_WEBHOOK_CLEANUP_TASK_TYPE = 'workflows:inbound-webhook-cleanup';
const INBOUND_WEBHOOK_CLEANUP_TASK_ID = 'workflows:inbound-webhook-cleanup';
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

export const registerInboundWebhookCleanupTask = ({
  taskManager,
  getApiKeyService,
  getMappingRepository,
}: {
  taskManager: TaskManagerSetupContract;
  getApiKeyService: () => InboundWebhookApiKeyService;
  getMappingRepository: () => InboundWebhookMappingRepository;
}): void => {
  taskManager.registerTaskDefinitions({
    [INBOUND_WEBHOOK_CLEANUP_TASK_TYPE]: {
      title: 'Clean up inbound webhook credentials',
      description: 'Invalidates credentials abandoned by interrupted connector saves.',
      timeout: '2m',
      maxAttempts: 1,
      cost: TaskCost.Tiny,
      priority: TaskPriority.Low,
      createTaskRunner: ({ abortController }) => ({
        run: async () => {
          const pending = await getMappingRepository().getPendingBefore(
            new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString()
          );
          for (const savedObject of pending) {
            if (abortController.signal.aborted) {
              break;
            }
            await getApiKeyService().invalidate(savedObject.attributes.payload);
            await getMappingRepository().deleteSavedObject(savedObject);
          }
          return { state: {} };
        },
      }),
    },
  });
};

export const scheduleInboundWebhookCleanupTask = async (
  taskManager: TaskManagerStartContract
): Promise<void> => {
  await taskManager.ensureScheduled({
    id: INBOUND_WEBHOOK_CLEANUP_TASK_ID,
    taskType: INBOUND_WEBHOOK_CLEANUP_TASK_TYPE,
    schedule: { interval: '1h' },
    params: {},
    state: {},
  });
};
