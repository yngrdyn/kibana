/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Plugin, CoreSetup, CoreStart } from '@kbn/core/server';
import type { WorkflowsExtensionsServerPluginSetup, WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import { registerStepDefinitions } from './step_types';
import { registerTriggers } from './triggers';
import { registerEmitEventRoute } from './routes/emit_event';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsExtensionsExamplePluginSetup {
  // No public API needed
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsExtensionsExamplePluginStart {
  // No public API needed
}

export interface WorkflowsExtensionsExamplePluginSetupDeps {
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
}
export interface WorkflowsExtensionsExamplePluginStartDeps {
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
}

export class WorkflowsExtensionsExamplePlugin
  implements
    Plugin<
      WorkflowsExtensionsExamplePluginSetup,
      WorkflowsExtensionsExamplePluginStart,
      WorkflowsExtensionsExamplePluginSetupDeps,
      WorkflowsExtensionsExamplePluginStartDeps
    >
{
  public setup(
    core: CoreSetup<WorkflowsExtensionsExamplePluginStartDeps>,
    plugins: WorkflowsExtensionsExamplePluginSetupDeps
  ): WorkflowsExtensionsExamplePluginSetup {
    // Register steps on setup phase
    registerStepDefinitions(plugins.workflowsExtensions);
    // Register triggers on setup phase
    registerTriggers(plugins.workflowsExtensions);

    // Register route for emitting events
    const router = core.http.createRouter();
    registerEmitEventRoute(router, () => core.getStartServices());

    return {};
  }

  public start(
    _core: CoreStart,
    _plugins: WorkflowsExtensionsExamplePluginStartDeps
  ): WorkflowsExtensionsExamplePluginStart {
    return {};
  }

  public stop() {}
}
