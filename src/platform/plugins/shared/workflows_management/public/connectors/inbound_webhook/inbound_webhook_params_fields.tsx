/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCallOut, EuiFormRow, EuiTextArea } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { ActionConnectorMode } from '@kbn/triggers-actions-ui-plugin/public';
import {
  INBOUND_WEBHOOK_RECEIVE_SUB_ACTION,
} from '../../../common/inbound_webhook/constants';

interface InboundWebhookTestParams {
  subAction: typeof INBOUND_WEBHOOK_RECEIVE_SUB_ACTION;
  subActionParams: {
    eventId: string;
    credentialRevision: string;
    body: Record<string, unknown>;
    query: Record<string, string | string[]>;
    headers: Record<string, string>;
    receivedAt: string;
  };
}

const DEFAULT_TEST_BODY: Record<string, unknown> = {
  message: 'Test webhook event from Kibana',
};

export const createInboundWebhookTestSubActionParams = (
  credentialRevision: string,
  body: Record<string, unknown> = DEFAULT_TEST_BODY
): InboundWebhookTestParams['subActionParams'] => ({
  eventId: window.crypto.randomUUID(),
  credentialRevision,
  body,
  query: {},
  headers: { 'content-type': 'application/json' },
  receivedAt: new Date().toISOString(),
});

export const InboundWebhookParamsFields = ({
  actionParams,
  actionConnector,
  editAction,
  index,
  executionMode,
}: ActionParamsProps<InboundWebhookTestParams>) => {
  const isTest = executionMode === ActionConnectorMode.Test;
  const credentialRevision =
    typeof actionConnector?.config?.credentialRevision === 'string'
      ? actionConnector.config.credentialRevision
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
    if (!isTest) {
      return;
    }

    if (
      actionParams.subAction !== INBOUND_WEBHOOK_RECEIVE_SUB_ACTION ||
      !actionParams.subActionParams
    ) {
      initializeTestParams();
    }
  }, [
    actionParams.subAction,
    actionParams.subActionParams,
    initializeTestParams,
    isTest,
  ]);

  const bodyJson = useMemo(
    () => JSON.stringify(actionParams.subActionParams?.body ?? DEFAULT_TEST_BODY, null, 2),
    [actionParams.subActionParams?.body]
  );

  if (!isTest) {
    return null;
  }

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
              const body = JSON.parse(event.target.value) as Record<string, unknown>;
              if (!actionParams.subActionParams) {
                initializeTestParams();
                return;
              }
              editAction(
                'subActionParams',
                {
                  ...actionParams.subActionParams,
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
