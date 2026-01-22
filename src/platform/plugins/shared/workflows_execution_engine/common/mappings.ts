/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

export const PLUGIN_ID = 'workflowsExecutionEngine';
export const PLUGIN_NAME = 'Workflows Execution Engine';

export const WORKFLOWS_EXECUTIONS_INDEX = '.workflows-executions';
export const WORKFLOWS_STEP_EXECUTIONS_INDEX = '.workflows-step-executions';
export const WORKFLOWS_EVENTS_INDEX = '.workflows-events-poc';
export const WORKFLOWS_SUBSCRIPTIONS_INDEX = '.workflows-subscriptions';

export const WORKFLOWS_EXECUTIONS_INDEX_MAPPINGS: MappingTypeMapping = {
  dynamic: false,
  properties: {
    spaceId: {
      type: 'keyword',
    },
    id: {
      type: 'keyword',
    },
    workflowId: {
      type: 'keyword',
    },
    status: {
      type: 'keyword',
    },
    workflowDefinition: {
      type: 'object',
      enabled: false,
    },
    createdAt: {
      type: 'date',
    },
    isTestRun: {
      type: 'boolean',
    },
    createdBy: {
      type: 'keyword',
    },
    startedAt: {
      type: 'date',
    },
    finishedAt: {
      type: 'date',
    },
    duration: {
      type: 'long',
    },
    triggeredBy: {
      type: 'keyword',
    },
    concurrencyGroupKey: {
      type: 'keyword',
    },
  },
};

export const WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS: MappingTypeMapping = {
  dynamic: false,
  properties: {
    spaceId: {
      type: 'keyword',
    },
    id: {
      type: 'keyword',
    },
    stepId: {
      type: 'keyword',
    },
    workflowRunId: {
      type: 'keyword',
    },
    workflowId: {
      type: 'keyword',
    },
    status: {
      type: 'keyword',
    },
    startedAt: {
      type: 'date',
    },
    finishedAt: {
      type: 'date',
    },
    duration: {
      // milliseconds
      type: 'long',
    },
  },
};

export const WORKFLOWS_EVENTS_INDEX_MAPPINGS: MappingTypeMapping = {
  dynamic: false,
  properties: {
    id: {
      type: 'keyword',
    },
    triggerType: {
      type: 'keyword',
    },
    payload: {
      type: 'object',
      enabled: false, // Store as JSON, don't index fields
    },
    spaceId: {
      type: 'keyword',
    },
    timestamp: {
      type: 'date',
    },
    credentialRef: {
      type: 'object',
      properties: {
        type: {
          type: 'keyword',
        },
        principalId: {
          type: 'keyword',
        },
      },
    },
    status: {
      type: 'keyword',
    },
    processingStartedAt: {
      type: 'date',
    },
  },
};

export const WORKFLOWS_SUBSCRIPTIONS_INDEX_MAPPINGS: MappingTypeMapping = {
  dynamic: false,
  properties: {
    id: {
      type: 'keyword',
    },
    workflowId: {
      type: 'keyword',
    },
    triggerType: {
      type: 'keyword',
    },
    spaceId: {
      type: 'keyword',
    },
    where: {
      type: 'text',
    },
    enabled: {
      type: 'boolean',
    },
    createdAt: {
      type: 'date',
    },
    updatedAt: {
      type: 'date',
    },
    createdBy: {
      type: 'keyword',
    },
  },
};
