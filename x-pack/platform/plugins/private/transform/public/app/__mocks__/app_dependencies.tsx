/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import type {
  IKibanaSearchResponse,
  IKibanaSearchRequest,
  ISearchGeneric,
} from '@kbn/search-types';
import type { ScopedHistory } from '@kbn/core/public';
import { coreMock, themeServiceMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { TriggersAndActionsUIPublicPluginStart } from '@kbn/triggers-actions-ui-plugin/public';
import { savedSearchPluginMock } from '@kbn/saved-search-plugin/public/mocks';
import { contentManagementMock } from '@kbn/content-management-plugin/public/mocks';

import type { AppDependencies } from '../app_dependencies';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import { settingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { fieldsMetadataPluginPublicMock } from '@kbn/fields-metadata-plugin/public/mocks';

const coreSetup = coreMock.createSetup();
const coreStart = coreMock.createStart();
const dataStart = dataPluginMock.createStartContract();
const dataViewsStart = dataViewPluginMocks.createStartContract();

// Replace mock to support tests for `use_index_data`.
dataStart.search.search = jest.fn(({ params }: IKibanaSearchRequest) => {
  const hits = [];

  // simulate a cross cluster search result
  // against a cluster that doesn't support fields
  if (params.index.includes(':')) {
    hits.push({
      _id: 'the-doc',
      _index: 'the-index',
    });
  }

  return of<IKibanaSearchResponse>({
    rawResponse: {
      hits: {
        hits,
        total: {
          value: 0,
          relation: 'eq',
        },
        max_score: 0,
      },
      timed_out: false,
      took: 10,
      _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    },
  });
}) as ISearchGeneric;

// Replace mock to support tests for `use_index_data`.
coreSetup.http.post = jest.fn().mockImplementation((endpoint) => {
  if (endpoint === '/internal/transform/transforms/_preview') {
    return Promise.resolve({
      generated_dest_index: { mappings: { properties: {} } },
      preview: [],
    });
  }
});

const appDependencies: AppDependencies = {
  analytics: coreStart.analytics,
  application: coreStart.application,
  charts: chartPluginMock.createStartContract(),
  chrome: coreStart.chrome,
  data: dataStart,
  dataViews: dataViewsStart,
  docLinks: coreStart.docLinks,
  i18n: coreStart.i18n,
  fieldFormats: fieldFormatsServiceMock.createStartContract(),
  notifications: coreStart.notifications,
  uiSettings: coreStart.uiSettings,
  storage: { get: jest.fn() } as unknown as Storage,
  overlays: coreStart.overlays,
  theme: themeServiceMock.createStartContract(),
  userProfile: userProfileServiceMock.createStart(),
  http: coreSetup.http,
  history: {} as ScopedHistory,
  share: { urlGenerators: { getUrlGenerator: jest.fn() } } as unknown as SharePluginStart,
  triggersActionsUi: {} as jest.Mocked<TriggersAndActionsUIPublicPluginStart>,
  unifiedSearch: unifiedSearchPluginMock.createStartContract(),
  savedObjectsManagement: {} as jest.Mocked<SavedObjectsManagementPluginStart>,
  settings: settingsServiceMock.createStartContract(),
  savedSearch: savedSearchPluginMock.createStartContract(),
  contentManagement: contentManagementMock.createStartContract(),
  fieldsMetadata: fieldsMetadataPluginPublicMock.createStartContract(),
};

export const useAppDependencies = () => {
  return appDependencies;
};

export const useToastNotifications = () => {
  return { ...coreSetup.notifications, addDanger: jest.fn() };
};
