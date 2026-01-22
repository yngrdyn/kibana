/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import type { Plugin, CoreSetup, CoreStart, AppMountParameters } from '@kbn/core/public';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';
import { registerStepDefinitions } from './step_types';
import { registerTriggers } from './triggers';
import { ExampleExternalService } from '../common/external_service/external_service';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsExtensionsExamplePublicPluginSetup {
  // No public API needed
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsExtensionsExamplePublicPluginStart {
  // No public API needed
}

export interface WorkflowsExtensionsExamplePublicPluginSetupDeps {
  workflowsExtensions: WorkflowsExtensionsPublicPluginSetup;
  developerExamples?: {
    register: (def: { appId: string; title: string; description: string }) => void;
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WorkflowsExtensionsExamplePublicPluginStartDeps {
  // No dependencies needed
}

export class WorkflowsExtensionsExamplePlugin
  implements
    Plugin<
      WorkflowsExtensionsExamplePublicPluginSetup,
      WorkflowsExtensionsExamplePublicPluginStart,
      WorkflowsExtensionsExamplePublicPluginSetupDeps,
      WorkflowsExtensionsExamplePublicPluginStartDeps
    >
{
  public setup(
    core: CoreSetup,
    plugins: WorkflowsExtensionsExamplePublicPluginSetupDeps
  ): WorkflowsExtensionsExamplePublicPluginSetup {
    // Register steps on setup phase
    registerStepDefinitions(plugins.workflowsExtensions, {
      externalService: new ExampleExternalService({
        'my-proxy': 'https://example.com',
        'my-other-proxy': 'https://example.com/other',
        'my-third-proxy': 'https://example.com/third',
        'my-fourth-proxy': 'https://example.com/fourth',
        'my-fifth-proxy': 'https://example.com/fifth',
      }),
    });
    // Register triggers on setup phase
    registerTriggers(plugins.workflowsExtensions);

    // Register application
    core.application.register({
      id: 'workflowsExtensionsExample',
      title: 'Workflows Extensions Example',
      visibleIn: [],
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services
        const [coreStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, params);
      },
    });

    // Register with developer examples
    plugins.developerExamples?.register({
      appId: 'workflowsExtensionsExample',
      title: 'Workflows Extensions Example',
      description:
        'Example plugin demonstrating how to register custom workflow extensions and emit events',
    });

    return {};
  }

  public start(
    _core: CoreStart,
    _plugins: WorkflowsExtensionsExamplePublicPluginStartDeps
  ): WorkflowsExtensionsExamplePublicPluginStart {
    return {};
  }

  public stop() {}
}
