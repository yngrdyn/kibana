/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  ActionTypeModel,
  GenericValidationResult,
} from '@kbn/triggers-actions-ui-plugin/public';
import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';

export const getInboundWebhookConnectorType = (): ActionTypeModel<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
> => ({
  id: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
  iconClass: 'link',
  selectMessage: i18n.translate('stackConnectors.inboundWebhook.connectorSelectDescription', {
    defaultMessage: 'Receive HTTP requests from external systems and trigger workflows.',
  }),
  actionTypeTitle: i18n.translate('stackConnectors.inboundWebhook.connectorTitle', {
    defaultMessage: 'Inbound Webhook',
  }),
  validateParams: async (): Promise<GenericValidationResult<unknown>> => ({ errors: {} }),
  actionParamsFields: lazy(async () => ({ default: () => null })),
  actionConnectorFields: lazy(() =>
    import('./inbound_webhook_connector_fields').then(({ InboundWebhookConnectorFields }) => ({
      default: InboundWebhookConnectorFields,
    }))
  ),
});
