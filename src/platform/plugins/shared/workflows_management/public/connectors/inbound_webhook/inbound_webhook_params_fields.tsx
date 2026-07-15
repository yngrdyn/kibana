/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButton,
  EuiCallOut,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IExecutionLog } from '@kbn/actions-plugin/common';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import { InboundWebhookRelativeTime } from './inbound_webhook_relative_time';
import { loadInboundWebhookExecutionLogs } from './load_inbound_webhook_execution_logs';

export const INBOUND_WEBHOOK_EVENTS_POLL_INTERVAL_MS = 2_000;

const getStatusColor = (status: string): 'success' | 'danger' | 'warning' | 'subdued' => {
  switch (status) {
    case 'success':
      return 'success';
    case 'failure':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'subdued';
  }
};

export const InboundWebhookParamsFields = ({
  actionConnector,
}: ActionParamsProps<Record<string, unknown>>) => {
  const { http } = useKibana().services;
  const connectorId = actionConnector?.id;
  const [logs, setLogs] = useState<IExecutionLog[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const requestController = useRef<AbortController>();

  const loadEvents = useCallback(async () => {
    if (!connectorId) {
      return;
    }

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await loadInboundWebhookExecutionLogs({
        http,
        connectorId,
        signal: controller.signal,
      });
      setLogs(result.data);
    } catch (loadError) {
      if (controller.signal.aborted) {
        return;
      }
      setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [connectorId, http]);

  useEffect(() => {
    void loadEvents();
    const intervalId = window.setInterval(() => {
      void loadEvents();
    }, INBOUND_WEBHOOK_EVENTS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      requestController.current?.abort();
    };
  }, [loadEvents]);

  const columns = useMemo<Array<EuiBasicTableColumn<IExecutionLog>>>(
    () => [
      {
        field: 'timestamp',
        name: i18n.translate('inboundEvents.inboundWebhook.receivedEvents.timestampColumn', {
          defaultMessage: 'Received',
        }),
        render: (timestamp: string) => <InboundWebhookRelativeTime value={timestamp} />,
      },
      {
        field: 'status',
        name: i18n.translate('inboundEvents.inboundWebhook.receivedEvents.statusColumn', {
          defaultMessage: 'Status',
        }),
        render: (status: string) => <EuiHealth color={getStatusColor(status)}>{status}</EuiHealth>,
      },
      {
        field: 'message',
        name: i18n.translate('inboundEvents.inboundWebhook.receivedEvents.messageColumn', {
          defaultMessage: 'Message',
        }),
        truncateText: true,
      },
      {
        field: 'duration_ms',
        name: i18n.translate('inboundEvents.inboundWebhook.receivedEvents.durationColumn', {
          defaultMessage: 'Duration',
        }),
        render: (duration: number) =>
          i18n.translate('inboundEvents.inboundWebhook.receivedEvents.durationValue', {
            defaultMessage: '{duration} ms',
            values: { duration: Math.round(duration) },
          }),
      },
      {
        field: 'id',
        name: i18n.translate('inboundEvents.inboundWebhook.receivedEvents.executionIdColumn', {
          defaultMessage: 'Execution ID',
        }),
        render: (id: string) => <EuiCode>{id}</EuiCode>,
      },
    ],
    []
  );

  if (!connectorId) {
    return (
      <EuiCallOut
        announceOnMount={false}
        title={i18n.translate(
          'inboundEvents.inboundWebhook.receivedEvents.connectorRequiredTitle',
          { defaultMessage: 'Save the connector to view received events' }
        )}
        color="primary"
      />
    );
  }

  return (
    <>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>
              <FormattedMessage
                id="inboundEvents.inboundWebhook.receivedEvents.title"
                defaultMessage="Received events"
              />
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="refresh"
            isLoading={isLoading}
            onClick={() => void loadEvents()}
            data-test-subj="refreshInboundWebhookReceivedEvents"
          >
            <FormattedMessage
              id="inboundEvents.inboundWebhook.receivedEvents.refreshButton"
              defaultMessage="Refresh"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          <FormattedMessage
            id="inboundEvents.inboundWebhook.receivedEvents.description"
            defaultMessage="The five most recent connector executions are shown and refreshed every 2 seconds. New events can take a moment to appear."
          />
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      {error ? (
        <EuiCallOut
          announceOnMount={false}
          title={i18n.translate('inboundEvents.inboundWebhook.receivedEvents.loadErrorTitle', {
            defaultMessage: 'Unable to load received events',
          })}
          color="danger"
          iconType="error"
          data-test-subj="inboundWebhookReceivedEventsError"
        />
      ) : isLoading && logs === undefined ? (
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="m" data-test-subj="inboundWebhookReceivedEventsLoading" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <EuiBasicTable
          items={logs ?? []}
          columns={columns}
          tableCaption={i18n.translate('inboundEvents.inboundWebhook.receivedEvents.tableCaption', {
            defaultMessage: 'Recent inbound webhook connector executions',
          })}
          noItemsMessage={i18n.translate(
            'inboundEvents.inboundWebhook.receivedEvents.emptyMessage',
            { defaultMessage: 'No received events found in the last 90 days.' }
          )}
          rowProps={(log) => ({ 'data-test-subj': `inboundWebhookReceivedEvent-${log.id}` })}
          data-test-subj="inboundWebhookReceivedEventsTable"
        />
      )}
    </>
  );
};
