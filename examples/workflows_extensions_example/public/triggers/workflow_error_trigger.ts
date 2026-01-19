/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import { workflowErrorTriggerCommonDefinition } from '../../common/triggers/workflow_error_trigger';

/**
 * Register the workflow.error trigger on the public side.
 * This provides UI metadata for the trigger.
 */
export function registerWorkflowErrorTrigger(
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup
): void {
  workflowsExtensions.registerTrigger(workflowErrorTriggerCommonDefinition);
}
