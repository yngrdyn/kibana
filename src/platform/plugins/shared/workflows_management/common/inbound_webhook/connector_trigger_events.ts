/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ConnectorEventInfo } from '@kbn/workflows';
import {
  INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
  INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID,
} from './constants';

const INBOUND_WEBHOOK_RECEIVED_EVENT: ConnectorEventInfo = {
  eventKey: 'received',
  eventId: INBOUND_WEBHOOK_RECEIVED_TRIGGER_ID,
  title: i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerTitle', {
    defaultMessage: 'Webhook received',
  }),
  description: i18n.translate('workflowsManagement.inboundWebhook.receivedTriggerDescription', {
    defaultMessage: 'When an HTTP request is received on the inbound webhook endpoint.',
  }),
  stability: 'tech_preview',
};

const CONNECTOR_TRIGGER_EVENTS: Record<string, ConnectorEventInfo[]> = {
  [INBOUND_WEBHOOK_CONNECTOR_TYPE_ID]: [INBOUND_WEBHOOK_RECEIVED_EVENT],
};

export const getConnectorTriggerEventsForType = (actionTypeId: string): ConnectorEventInfo[] =>
  CONNECTOR_TRIGGER_EVENTS[actionTypeId] ?? [];

export const getConnectorActionTypeIdForEventTriggerId = (
  eventId: string
): string | undefined => {
  for (const [actionTypeId, events] of Object.entries(CONNECTOR_TRIGGER_EVENTS)) {
    if (events.some((event) => event.eventId === eventId)) {
      return actionTypeId;
    }
  }
  return undefined;
};
