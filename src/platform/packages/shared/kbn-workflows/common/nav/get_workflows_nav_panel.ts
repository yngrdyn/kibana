/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NodeDefinition } from '@kbn/core-chrome-browser';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { WORKFLOWS_LIBRARY_ENABLED_SETTING_ID } from '../constants';

const PANEL_ID = 'workflows';

/**
 * Returns Workflows side-nav entries for solution navigation trees.
 *
 */
export const getWorkflowsNavPanel = (core: CoreStart): NodeDefinition[] => {
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
