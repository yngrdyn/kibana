/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** Keep in sync with `WORKFLOWS_LIBRARY_ENABLED_SETTING_ID` in `@kbn/workflows`. */
const WORKFLOWS_LIBRARY_ENABLED_SETTING_ID = 'workflowsManagement:library:enabled';

const PANEL_ID = 'workflows';

/**
 * Minimal `CoreStart` shape for nav gating. Satisfied by `CoreStart` at call sites.
 *
 * Intentionally structural (no import from `@kbn/core-*`) to avoid a dependency cycle:
 * `@kbn/core-chrome-browser` already imports this package for `AppDeepLinkId` typing.
 */
export interface WorkflowsNavPanelCore {
  settings: {
    globalClient: {
      get: <T>(key: string, defaultValue: T) => T;
    };
  };
}

type WorkflowsNavNode =
  | { link: 'workflows' }
  | {
      id: typeof PANEL_ID;
      link: 'workflows';
      renderAs: 'panelOpener';
      children: [
        {
          breadcrumbStatus: 'hidden';
          children: [{ link: 'workflows:workflows' }, { link: 'workflows:library' }];
        }
      ];
    };

/**
 * Returns Workflows side-nav entries for solution navigation trees.
 *
 * When the Workflow Template Library tech preview is enabled, returns a panel
 * opener with list and library children. Otherwise returns a single direct link.
 *
 * ```ts
 * ...getWorkflowsNavPanel(core),
 * ```
 */
export const getWorkflowsNavPanel = (core: WorkflowsNavPanelCore): WorkflowsNavNode[] => {
  const libraryEnabled = core.settings.globalClient.get<boolean>(
    WORKFLOWS_LIBRARY_ENABLED_SETTING_ID,
    false
  );

  if (!libraryEnabled) {
    return [{ link: 'workflows' }];
  }

  return [
    {
      id: PANEL_ID,
      link: 'workflows',
      renderAs: 'panelOpener',
      children: [
        {
          breadcrumbStatus: 'hidden',
          children: [{ link: 'workflows:workflows' }, { link: 'workflows:library' }],
        },
      ],
    },
  ];
};
