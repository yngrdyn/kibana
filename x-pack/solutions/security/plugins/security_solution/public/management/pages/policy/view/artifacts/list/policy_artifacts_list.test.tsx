/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { getFoundExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/found_exception_list_item_schema.mock';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { EndpointDocGenerator } from '../../../../../../../common/endpoint/generate_data';
import type { PolicyData } from '../../../../../../../common/endpoint/types';
import { getEventFiltersListPath, getPolicyEventFiltersPath } from '../../../../../common/routing';
import { eventFiltersListQueryHttpMock } from '../../../../event_filters/test_utils';
import { PolicyArtifactsList } from './policy_artifacts_list';
import { parseQueryFilterToKQL, parsePoliciesAndFilterToKql } from '../../../../../common/utils';
import { SEARCHABLE_FIELDS } from '../../../../event_filters/constants';
import { useUserPrivileges as _useUserPrivileges } from '../../../../../../common/components/user_privileges';
import { POLICY_ARTIFACT_LIST_LABELS } from './translations';
import { EventFiltersApiClient } from '../../../../event_filters/service/api_client';
import { ExceptionsListItemGenerator } from '../../../../../../../common/endpoint/data_generators/exceptions_list_item_generator';
import { buildPerPolicyTag } from '../../../../../../../common/endpoint/service/artifacts/utils';

jest.mock('../../../../../../common/components/user_privileges');
const useUserPrivilegesMock = _useUserPrivileges as jest.Mock;

const endpointGenerator = new EndpointDocGenerator('seed');
const getDefaultQueryParameters = (customFilter: string | undefined = '') => ({
  path: '/api/exception_lists/items/_find',
  version: '2023-10-31',
  query: {
    filter: customFilter,
    list_id: ['endpoint_event_filters'],
    namespace_type: ['agnostic'],
    page: 1,
    per_page: 10,
    sort_field: 'created_at',
    sort_order: 'desc',
  },
});

jest.setTimeout(10000);

describe('Policy details artifacts list', () => {
  let render: (canWriteArtifact?: boolean) => Promise<ReturnType<AppContextTestRender['render']>>;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let history: AppContextTestRender['history'];
  let mockedContext: AppContextTestRender;
  let mockedApi: ReturnType<typeof eventFiltersListQueryHttpMock>;
  let policy: PolicyData;
  let handleOnDeleteActionCallbackMock: jest.Mock;
  beforeEach(() => {
    policy = endpointGenerator.generatePolicyPackagePolicy();
    mockedContext = createAppRootMockRenderer();
    mockedApi = eventFiltersListQueryHttpMock(mockedContext.coreStart.http);
    ({ history } = mockedContext);
    handleOnDeleteActionCallbackMock = jest.fn();
    render = async (canWriteArtifact = true) => {
      renderResult = mockedContext.render(
        <PolicyArtifactsList
          policy={policy}
          apiClient={EventFiltersApiClient.getInstance(mockedContext.coreStart.http)}
          searchableFields={[...SEARCHABLE_FIELDS]}
          labels={POLICY_ARTIFACT_LIST_LABELS}
          onDeleteActionCallback={handleOnDeleteActionCallbackMock}
          canWriteArtifact={canWriteArtifact}
          getPolicyArtifactsPath={getPolicyEventFiltersPath}
          getArtifactPath={getEventFiltersListPath}
          CardDecorator={undefined}
        />
      );
      await waitFor(() => expect(mockedApi.responseProvider.eventFiltersList).toHaveBeenCalled());
      await waitFor(() =>
        expect(renderResult.queryByTestId('artifacts-collapsed-list-loader')).toBeFalsy()
      );
      return renderResult;
    };

    history.push(getPolicyEventFiltersPath(policy.id));
  });

  it('should display a searchbar and count even with no exceptions', async () => {
    mockedApi.responseProvider.eventFiltersList.mockReturnValue(
      getFoundExceptionListItemSchemaMock(0)
    );
    await render();
    expect(renderResult.getByTestId('policyDetailsArtifactsSearchCount')).toHaveTextContent(
      'Showing 0 artifacts'
    );
    expect(renderResult.getByTestId('searchField')).toBeTruthy();
  });

  it('should render the list of exceptions collapsed', async () => {
    mockedApi.responseProvider.eventFiltersList.mockReturnValue(
      getFoundExceptionListItemSchemaMock(3)
    );
    await render();
    expect(renderResult.getAllByTestId('artifacts-collapsed-list-card')).toHaveLength(3);
    expect(
      renderResult.queryAllByTestId('artifacts-collapsed-list-card-criteriaConditions')
    ).toHaveLength(0);
  });

  it('should expand an item when expand is clicked', async () => {
    await render();
    await waitFor(() => {
      expect(renderResult.getAllByTestId('artifacts-collapsed-list-card')).toHaveLength(1);
    });

    await userEvent.click(
      renderResult.getByTestId('artifacts-collapsed-list-card-header-expandCollapse')
    );

    expect(
      renderResult.queryAllByTestId('artifacts-collapsed-list-card-criteriaConditions')
    ).toHaveLength(1);
  });

  it('should change the address location when a filter is applied', async () => {
    await render();
    await userEvent.type(renderResult.getByTestId('searchField'), 'search me{enter}');
    expect(history.location.search).toBe('?filter=search%20me');
  });

  it('should call query with and without a filter', async () => {
    await render();
    expect(mockedApi.responseProvider.eventFiltersList).toHaveBeenLastCalledWith(
      getDefaultQueryParameters(
        parsePoliciesAndFilterToKql({
          policies: [policy.id, 'all'],
          kuery: parseQueryFilterToKQL('', SEARCHABLE_FIELDS),
        })
      )
    );
    await userEvent.type(renderResult.getByTestId('searchField'), 'search me{enter}');
    await waitFor(() => {
      expect(mockedApi.responseProvider.eventFiltersList).toHaveBeenLastCalledWith(
        getDefaultQueryParameters(
          parsePoliciesAndFilterToKql({
            policies: [policy.id, 'all'],
            kuery: parseQueryFilterToKQL('search me', SEARCHABLE_FIELDS),
          })
        )
      );
    });
  });

  it('should enable the "view full details" action', async () => {
    mockedApi.responseProvider.eventFiltersList.mockReturnValue(
      getFoundExceptionListItemSchemaMock()
    );
    await render();
    // click the actions button
    await userEvent.click(
      renderResult.getByTestId('artifacts-collapsed-list-card-header-actions-button')
    );
    expect(renderResult.queryByTestId('view-full-details-action')).toBeTruthy();
  });

  it('does not show remove option in actions menu if license is downgraded to gold or below', async () => {
    mockedContext
      .getUserPrivilegesMockSetter(useUserPrivilegesMock)
      .set({ canCreateArtifactsByPolicy: false });
    mockedApi.responseProvider.eventFiltersList.mockReturnValue(
      getFoundExceptionListItemSchemaMock()
    );
    await render();
    await userEvent.click(
      renderResult.getByTestId('artifacts-collapsed-list-card-header-actions-button')
    );

    expect(renderResult.queryByTestId('remove-from-policy-action')).toBeNull();
  });

  it('should replace old url search pagination params with correct ones', async () => {
    history.replace(`${history.location.pathname}?page_index=0&page_size=10`);
    await render();

    expect(history.location.search).toMatch('pageSize=10');
    expect(history.location.search).toMatch('page=1');
    expect(history.location.search).not.toMatch('page_index');
    expect(history.location.search).not.toMatch('page_size');
  });

  it('should retrieve all policies using getById api', async () => {
    const generator = new ExceptionsListItemGenerator('seed');

    mockedApi.responseProvider.eventFiltersList.mockReturnValue({
      data: [
        generator.generateEventFilter({
          tags: [buildPerPolicyTag('policy-1'), buildPerPolicyTag('policy-2')],
        }),
        generator.generateEventFilter({
          tags: [buildPerPolicyTag('policy-3'), buildPerPolicyTag('policy-2')],
        }),
      ],
      page: 1,
      per_page: 1,
      total: 1,
    });
    await render();

    expect(mockedContext.coreStart.http.post).toHaveBeenCalledWith(
      '/api/fleet/package_policies/_bulk_get',
      {
        body: '{"ids":["policy-1","policy-2","policy-3"],"ignoreMissing":true}',
        version: expect.any(String),
      }
    );
  });

  describe('without external privileges', () => {
    it('should not display the delete action, do show the full details', async () => {
      mockedApi.responseProvider.eventFiltersList.mockReturnValue(
        getFoundExceptionListItemSchemaMock(1)
      );
      await render(false);
      // click the actions button
      await userEvent.click(
        await renderResult.findByTestId('artifacts-collapsed-list-card-header-actions-button')
      );
      expect(renderResult.queryByTestId('remove-from-policy-action')).toBeFalsy();
      expect(renderResult.queryByTestId('view-full-details-action')).toBeTruthy();
    });
  });
});
