/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getConnectorActionTypeIdForEventTriggerId } from '../inbound_webhook/connector_trigger_events';

/**
 * Resolves the connector lookup key used to find connector instances for a YAML
 * `connector-id` field. Connector-event triggers (e.g. `inboundWebhook.received`)
 * map to their backing connector action type (e.g. `.workflows-inbound-webhook`).
 */
export const resolveConnectorIdLookupKeyFromYamlType = (yamlType: string): string => {
  const connectorActionTypeId = getConnectorActionTypeIdForEventTriggerId(yamlType);
  if (connectorActionTypeId) {
    return connectorActionTypeId.replace(/^\./, '');
  }
  return yamlType;
};
