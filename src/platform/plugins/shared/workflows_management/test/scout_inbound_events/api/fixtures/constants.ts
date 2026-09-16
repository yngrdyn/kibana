/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const INBOUND_EVENTS_API_VERSION = '2023-10-31';

export const inboundWorkflowYaml = (connectorId: string, name: string): string => `
name: ${name}
enabled: true
triggers:
  - type: inboundWebhook.received
    connector-id: ${connectorId}
steps:
  - name: log_it
    type: console
    with:
      message: "got {{ event.body.orderId }}"
`;
