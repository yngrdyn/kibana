/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { createMockActionConnector } from '@kbn/alerts-ui-shared/src/common/test_utils/connector.mock';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import {
  INBOUND_WEBHOOK_EVENTS_POLL_INTERVAL_MS,
  InboundWebhookParamsFields,
} from './inbound_webhook_params_fields';
import { loadInboundWebhookExecutionLogs } from './load_inbound_webhook_execution_logs';
import { TestProvider } from '../../shared/mocks/test_providers';

jest.mock('./load_inbound_webhook_execution_logs', () => ({
  loadInboundWebhookExecutionLogs: jest.fn(),
}));

jest.mock('./inbound_webhook_relative_time', () => ({
  InboundWebhookRelativeTime: ({ value }: { value: string }) => <span>{`relative:${value}`}</span>,
}));

const loadExecutionLogsMock = jest.mocked(loadInboundWebhookExecutionLogs);

const renderComponent = () => {
  const props: ActionParamsProps<Record<string, unknown>> = {
    actionParams: {},
    index: 0,
    editAction: jest.fn(),
    errors: {},
    actionConnector: createMockActionConnector({
      id: 'connector-1',
      actionTypeId: '.inboundWebhook',
    }),
  };

  return render(<InboundWebhookParamsFields {...props} />, { wrapper: TestProvider });
};

describe('InboundWebhookParamsFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the automatically logged execution metadata', async () => {
    loadExecutionLogsMock.mockResolvedValue({
      total: 1,
      data: [
        {
          id: 'execution-1',
          timestamp: '2026-07-15T10:00:00.000Z',
          duration_ms: 42.4,
          status: 'success',
          message: 'action executed',
          version: '1',
          schedule_delay_ms: 0,
          space_ids: ['default'],
          connector_name: 'Inbound webhook',
          connector_id: 'connector-1',
          timed_out: false,
          source: '',
        },
      ],
    });

    renderComponent();

    expect(await screen.findByText('action executed')).toBeInTheDocument();
    expect(screen.getByText('relative:2026-07-15T10:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('execution-1')).toBeInTheDocument();
    expect(loadExecutionLogsMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'connector-1' })
    );
  });

  it('renders an empty state', async () => {
    loadExecutionLogsMock.mockResolvedValue({ total: 0, data: [] });

    renderComponent();

    expect(
      await screen.findByText('No received events found in the last 90 days.')
    ).toBeInTheDocument();
  });

  it('renders loading and error states', async () => {
    let rejectRequest: (error: Error) => void = () => {};
    loadExecutionLogsMock.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject;
        })
    );

    renderComponent();
    expect(screen.getByTestId('inboundWebhookReceivedEventsLoading')).toBeInTheDocument();

    rejectRequest(new Error('failed'));

    expect(await screen.findByText('Unable to load received events')).toBeInTheDocument();
  });

  it('refreshes the execution history', async () => {
    loadExecutionLogsMock.mockResolvedValue({ total: 0, data: [] });

    renderComponent();
    await screen.findByText('No received events found in the last 90 days.');

    fireEvent.click(screen.getByTestId('refreshInboundWebhookReceivedEvents'));

    await waitFor(() => {
      expect(loadExecutionLogsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('polls for new execution history every two seconds', async () => {
    const setIntervalSpy = jest.spyOn(window, 'setInterval');
    loadExecutionLogsMock.mockResolvedValue({ total: 0, data: [] });

    const { unmount } = renderComponent();
    await screen.findByText('No received events found in the last 90 days.');

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      INBOUND_WEBHOOK_EVENTS_POLL_INTERVAL_MS
    );

    const poll = setIntervalSpy.mock.calls[0][0] as () => void;
    await act(async () => {
      poll();
    });

    expect(loadExecutionLogsMock).toHaveBeenCalledTimes(2);
    unmount();
    setIntervalSpy.mockRestore();
  });
});
