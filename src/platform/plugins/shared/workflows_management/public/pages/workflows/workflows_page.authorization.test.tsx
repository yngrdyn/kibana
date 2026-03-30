/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { useWorkflows } from '@kbn/workflows-ui';
import { WorkflowsPage } from '.';
import { TestWrapper } from '../../shared/test_utils/test_wrapper';

const mockUseKibana = jest.fn();

jest.mock('../../hooks/use_kibana', () => ({
  useKibana: () => mockUseKibana(),
}));

jest.mock('@kbn/workflows-ui', () => {
  const actual = jest.requireActual('@kbn/workflows-ui');
  return {
    ...actual,
    useWorkflows: jest.fn(),
  };
});

jest.mock('../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs', () => ({
  useWorkflowsBreadcrumbs: jest.fn(),
}));

jest.mock('../../entities/workflows/model/use_workflow_stats', () => ({
  useWorkflowFiltersOptions: () => ({
    data: {
      enabled: [],
      createdBy: [],
      tags: [],
    },
  }),
}));

jest.mock('../../features/workflow_list', () => ({
  WorkflowList: () => <div data-test-subj="mockWorkflowListForAuthzTest" />,
}));

const mockUseWorkflows = useWorkflows as jest.MockedFunction<typeof useWorkflows>;

const emptyWorkflowsResult = {
  data: { results: [], total: 0 },
  isLoading: false,
  error: undefined,
  refetch: jest.fn(),
};

const renderPage = () =>
  render(
    <TestWrapper>
      <I18nProvider>
        <EuiProvider colorMode="light">
          <WorkflowsPage />
        </EuiProvider>
      </I18nProvider>
    </TestWrapper>
  );

describe('WorkflowsPage authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflows.mockReturnValue(emptyWorkflowsResult as any);
  });

  it.each([
    {
      label: 'editor-style (create on)',
      createWorkflow: true,
      expectCreate: true,
    },
    {
      label: 'read-only (create off)',
      createWorkflow: false,
      expectCreate: false,
    },
  ])(
    'Create + Import in header when createWorkflow=$createWorkflow ($label)',
    ({ createWorkflow, expectCreate }) => {
      mockUseKibana.mockReturnValue({
        services: {
          application: {
            capabilities: {
              workflowsManagement: {
                createWorkflow,
              },
            },
            navigateToApp: jest.fn(),
          },
          featureFlags: {
            getBooleanValue: () => false,
          },
        },
      });

      renderPage();

      if (expectCreate) {
        expect(screen.getByTestId('createWorkflowButton')).toBeInTheDocument();
        expect(screen.getByTestId('importWorkflowsButton')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('createWorkflowButton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('importWorkflowsButton')).not.toBeInTheDocument();
      }
    }
  );
});
