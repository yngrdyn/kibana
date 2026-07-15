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
  IErrorObject,
} from '@kbn/triggers-actions-ui-plugin/public';
import { INBOUND_WEBHOOK_RECEIVE_SUB_ACTION } from '../../../common/inbound_webhook/constants';

interface InboundWebhookConfig {
  webhookKeyHash: string;
  credentialRevision: string;
}

interface InboundWebhookSecrets {
  webhookUrl?: string;
}

interface InboundWebhookParams {
  subAction: 'receive';
  subActionParams: Record<string, unknown>;
}

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
    const errors: IErrorObject = {};

    if (actionParams.subAction !== INBOUND_WEBHOOK_RECEIVE_SUB_ACTION) {
      errors.subAction = [
        i18n.translate('workflowsManagement.inboundWebhook.missingSubActionError', {
          defaultMessage: 'Sub action must be "receive".',
        }),
      ];
    }

    if (!actionParams.subActionParams || typeof actionParams.subActionParams !== 'object') {
      errors.subActionParams = [
        i18n.translate('workflowsManagement.inboundWebhook.missingSubActionParamsError', {
          defaultMessage: 'Sub action parameters are required.',
        }),
      ];
    }

    return { errors };
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
