/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { lazy } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  ActionTypeModel,
  GenericValidationResult,
} from '@kbn/triggers-actions-ui-plugin/public';
import { INBOUND_WEBHOOK_RECEIVE_SUB_ACTION } from '../../../common/inbound_webhook/constants';

export interface InboundWebhookConfig {
  webhookUrl: string;
  webhookKeyHash: string;
  credentialRevision: string;
}

export type InboundWebhookSecrets = Record<string, never>;

export interface InboundWebhookParams {
  subAction: 'receive';
  subActionParams: Record<string, unknown>;
}

const isConnectorTestParams = (params: unknown): boolean => {
  if (!params || typeof params !== 'object') {
    return false;
  }

  const subActionParams = params as Record<string, unknown>;
  return (
    typeof subActionParams.eventId === 'string' &&
    typeof subActionParams.credentialRevision === 'string' &&
    typeof subActionParams.body === 'object' &&
    subActionParams.body !== null &&
    typeof subActionParams.receivedAt === 'string'
  );
};

export const getInboundWebhookConnectorType = (): ActionTypeModel<
  InboundWebhookConfig,
  InboundWebhookSecrets,
  InboundWebhookParams
> => ({
  id: '.workflows-inbound-webhook',
  iconClass: 'link',
  selectMessage: i18n.translate('workflowsManagement.inboundWebhook.connectorSelectDescription', {
    defaultMessage: 'Receive JSON events from an external webhook.',
  }),
  actionTypeTitle: i18n.translate('workflowsManagement.inboundWebhook.connectorTitle', {
    defaultMessage: 'Inbound Webhook',
  }),
  validateParams: async (actionParams): Promise<GenericValidationResult<unknown>> => {
    if (
      actionParams.subAction === INBOUND_WEBHOOK_RECEIVE_SUB_ACTION &&
      isConnectorTestParams(actionParams.subActionParams)
    ) {
      return { errors: {} };
    }

    return {
      errors: {
        subAction: [
          i18n.translate('inboundEvents.inboundWebhook.manualExecutionDisabledError', {
            defaultMessage: 'Inbound webhook events can only be received through the webhook URL.',
          }),
        ],
      },
    };
  },
  actionConnectorFields: lazy(() =>
    import('./inbound_webhook_connector_fields').then(({ InboundWebhookConnectorFields }) => ({
      default: InboundWebhookConnectorFields,
    }))
  ),
  actionParamsFields: lazy(() =>
    import('./inbound_webhook_params_fields').then(({ InboundWebhookParamsFields }) => ({
      default: InboundWebhookParamsFields,
    }))
  ),
});
