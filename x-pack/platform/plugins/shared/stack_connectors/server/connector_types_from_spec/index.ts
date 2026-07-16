/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';

import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';
import * as connectorsSpecs from '@kbn/connector-specs/src/all_specs';
import { createConnectorTypeFromSpec } from '@kbn/actions-plugin/server/lib';
import type { KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';

import { registerInboundWebhookConnectorType } from './register_inbound_webhook_connector_type';

export function registerConnectorTypesFromSpecs({
  actions,
  getSpaceId,
  getPublicBaseUrl,
  getSecurity,
  logger,
}: {
  actions: ActionsPluginSetupContract;
  getSpaceId: (request: KibanaRequest) => string;
  getPublicBaseUrl: (request: KibanaRequest) => string;
  getSecurity: () => Promise<SecurityServiceStart>;
  logger: Logger;
}) {
  registerInboundWebhookConnectorType({
    actions,
    getSpaceId,
    getPublicBaseUrl,
    getSecurity,
    logger,
  });

  for (const spec of Object.values(connectorsSpecs)) {
    if (spec.metadata.id === INBOUND_WEBHOOK_CONNECTOR_TYPE_ID) {
      continue;
    }
    actions.registerType(createConnectorTypeFromSpec(spec, actions));
  }
}
