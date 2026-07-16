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
  EuiFormRow,
  EuiHealth,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IExecutionLog } from '@kbn/actions-plugin/common';
import type { RuleActionParam } from '@kbn/alerting-types';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { ActionConnectorMode, useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import type { InboundWebhookParams } from './inbound_webhook';
import { InboundWebhookRelativeTime } from './inbound_webhook_relative_time';
import { loadInboundWebhookExecutionLogs } from './load_inbound_webhook_execution_logs';
import { INBOUND_WEBHOOK_RECEIVE_SUB_ACTION } from '../../../common/inbound_webhook/constants';

export const INBOUND_WEBHOOK_EVENTS_POLL_INTERVAL_MS = 2_000;

interface InboundWebhookTestSubActionParams extends Record<string, RuleActionParam> {
  eventId: string;
  credentialRevision: string;
  body: Record<string, RuleActionParam>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  receivedAt: string;
}

const DEFAULT_TEST_BODY: Record<string, RuleActionParam> = {
  message: 'Test webhook event from Kibana',
};

export const createInboundWebhookTestSubActionParams = (
  credentialRevision: string,
  body: Record<string, RuleActionParam> = DEFAULT_TEST_BODY
): InboundWebhookTestSubActionParams => ({
  eventId: window.crypto.randomUUID(),
  credentialRevision,
  body,
  query: {},
  headers: { 'content-type': 'application/json' },
  receivedAt: new Date().toISOString(),
});

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

const InboundWebhookTestParamsFields = ({
  actionParams,
  actionConnector,
  editAction,
  index,
}: ActionParamsProps<InboundWebhookParams>) => {
  const subActionParams = actionParams.subActionParams as
    | Partial<InboundWebhookTestSubActionParams>
    | undefined;
  const connectorConfig =
    actionConnector && 'config' in actionConnector ? actionConnector.config : undefined;
  const credentialRevision =
    typeof connectorConfig?.credentialRevision === 'string'
      ? connectorConfig.credentialRevision
      : undefined;

  const initializeTestParams = useCallback(() => {
    if (!credentialRevision) {
      return;
    }

    editAction('subAction', INBOUND_WEBHOOK_RECEIVE_SUB_ACTION, index);
    editAction(
      'subActionParams',
      createInboundWebhookTestSubActionParams(credentialRevision),
      index
    );
  }, [credentialRevision, editAction, index]);

  useEffect(() => {
    if (actionParams.subAction !== INBOUND_WEBHOOK_RECEIVE_SUB_ACTION || !subActionParams) {
      initializeTestParams();
    }
  }, [actionParams.subAction, initializeTestParams, subActionParams]);

  const bodyJson = useMemo(
    () => JSON.stringify(subActionParams?.body ?? DEFAULT_TEST_BODY, null, 2),
    [subActionParams?.body]
  );

  if (!credentialRevision) {
    return (
      <EuiCallOut
        announceOnMount
        color="warning"
        iconType="warning"
        title={i18n.translate('workflowsManagement.inboundWebhook.testMissingRevisionTitle', {
          defaultMessage: 'Save the connector before testing',
        })}
      >
        <FormattedMessage
          id="workflowsManagement.inboundWebhook.testMissingRevisionDescription"
          defaultMessage="Connector credentials are assigned when the connector is saved. Save your changes, then run the test."
        />
      </EuiCallOut>
    );
  }

  return (
    <>
      <EuiCallOut
        announceOnMount={false}
        iconType="iInCircle"
        title={i18n.translate('workflowsManagement.inboundWebhook.testDescriptionTitle', {
          defaultMessage: 'Simulate a webhook delivery',
        })}
      >
        <FormattedMessage
          id="workflowsManagement.inboundWebhook.testDescriptionBody"
          defaultMessage="This sends a sample inbound webhook event through the connector executor. Workflows subscribed to this connector instance may run."
        />
      </EuiCallOut>
      <EuiFormRow
        fullWidth
        label={i18n.translate('workflowsManagement.inboundWebhook.testBodyLabel', {
          defaultMessage: 'Sample request body (JSON)',
        })}
      >
        <EuiTextArea
          fullWidth
          rows={6}
          value={bodyJson}
          data-test-subj="inboundWebhookTestBody"
          onChange={(event) => {
            try {
              const body = JSON.parse(event.target.value) as Record<string, RuleActionParam>;
              if (!subActionParams) {
                initializeTestParams();
                return;
              }
              editAction(
                'subActionParams',
                {
                  ...subActionParams,
                  body,
                  receivedAt: new Date().toISOString(),
                },
                index
              );
            } catch {
              // Ignore invalid JSON while the user is typing.
            }
          }}
        />
      </EuiFormRow>
    </>
  );
};

const InboundWebhookReceivedEventsFields = ({
  actionConnector,
}: ActionParamsProps<InboundWebhookParams>) => {
  const { http } = useKibana().services;
  const connectorId = actionConnector?.id;
  const connectorTypeId = actionConnector?.actionTypeId;
  const [logs, setLogs] = useState<IExecutionLog[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const requestController = useRef<AbortController>();

  const loadEvents = useCallback(async () => {
    if (!connectorId || !connectorTypeId) {
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
        connectorTypeId,
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
  }, [connectorId, connectorTypeId, http]);

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

export const InboundWebhookParamsFields = (props: ActionParamsProps<InboundWebhookParams>) => {
  if (props.executionMode === ActionConnectorMode.Test) {
    return (
      <>
        <InboundWebhookTestParamsFields {...props} />
        <EuiSpacer size="l" />
        <InboundWebhookReceivedEventsFields {...props} />
      </>
    );
  }

  return <InboundWebhookReceivedEventsFields {...props} />;
};
