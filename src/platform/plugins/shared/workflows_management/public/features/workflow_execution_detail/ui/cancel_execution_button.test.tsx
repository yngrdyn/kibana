/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { CancelExecutionButton } from './cancel_execution_button';

const mockUseKibana = jest.fn();

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => mockUseKibana(),
}));

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsApi: () => ({
    cancelExecution: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../../hooks/use_telemetry', () => ({
  useTelemetry: () => ({
    reportWorkflowRunCancelled: jest.fn(),
  }),
}));

describe('CancelExecutionButton authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      label: 'cancel allowed',
      cancelWorkflowExecution: true,
      expectDisabled: false,
    },
    {
      label: 'cancel denied',
      cancelWorkflowExecution: false,
      expectDisabled: true,
    },
  ])('$label: button disabled=$expectDisabled', ({ cancelWorkflowExecution, expectDisabled }) => {
    mockUseKibana.mockReturnValue({
      services: {
        application: {
          capabilities: {
            workflowsManagement: { cancelWorkflowExecution },
          },
        },
        notifications: { toasts: { addSuccess: jest.fn(), addError: jest.fn() } },
      },
    });

    render(
      <I18nProvider>
        <CancelExecutionButton
          executionId="exec-1"
          workflowId="wf-1"
          startedAt="2020-01-01T00:00:00Z"
        />
      </I18nProvider>
    );

    const button = screen.getByTestId('cancelExecutionButton');
    if (expectDisabled) {
      expect(button).toBeDisabled();
    } else {
      expect(button).not.toBeDisabled();
    }
  });
});
