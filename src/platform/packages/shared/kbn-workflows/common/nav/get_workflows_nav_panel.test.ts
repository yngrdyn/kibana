/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { coreMock } from '@kbn/core/public/mocks';
import { WORKFLOWS_LIBRARY_ENABLED_SETTING_ID } from '../constants';
import { getWorkflowsNavPanel } from './get_workflows_nav_panel';

describe('getWorkflowsNavPanel', () => {
  let core: CoreStart;

  beforeEach(() => {
    core = coreMock.createStart();
  });

  it('returns a single workflows link when the library is disabled', () => {
    core.settings.globalClient.get = <T>(key: string) =>
      (key === WORKFLOWS_LIBRARY_ENABLED_SETTING_ID ? false : undefined) as T;

    expect(getWorkflowsNavPanel(core)).toEqual([{ link: 'workflows' }]);
  });

  it('returns a panel opener with list and library children when the library is enabled', () => {
    core.settings.globalClient.get = <T>(key: string) =>
      (key === WORKFLOWS_LIBRARY_ENABLED_SETTING_ID ? true : undefined) as T;

    expect(getWorkflowsNavPanel(core)).toEqual([
      {
        id: 'workflows',
        link: 'workflows',
        renderAs: 'panelOpener',
        children: [
          {
            breadcrumbStatus: 'hidden',
            children: [{ link: 'workflows:workflows' }, { link: 'workflows:library' }],
          },
        ],
      },
    ]);
  });
});
