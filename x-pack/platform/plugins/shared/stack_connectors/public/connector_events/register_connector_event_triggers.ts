/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { toRegisteredConnectorEvent } from '@kbn/connector-specs';
import * as connectorsSpecs from '@kbn/connector-specs/src/all_specs';
import type { WorkflowsExtensionsPublicPluginSetup } from '@kbn/workflows-extensions/public';

const DEFAULT_CONNECTOR_EVENT_ICON = React.lazy(() =>
  import('@elastic/eui/es/components/icon/assets/plugs').then(({ icon }) => ({ default: icon }))
);

export function registerConnectorEventTriggers(
  workflowsExtensions?: WorkflowsExtensionsPublicPluginSetup
): void {
  if (!workflowsExtensions) {
    return;
  }

  for (const spec of Object.values(connectorsSpecs)) {
    if (!spec.events) {
      continue;
    }

    for (const [eventKey, definition] of Object.entries(spec.events.definitions)) {
      const event = toRegisteredConnectorEvent(spec.metadata, eventKey, definition);
      workflowsExtensions.registerTriggerDefinition({
        id: event.eventId,
        title: event.title,
        description: event.description,
        stability: event.stability ?? 'tech_preview',
        requiresConnectorId: true,
        eventSchema: event.eventSchema,
        icon: DEFAULT_CONNECTOR_EVENT_ICON,
        documentation: {
          details: i18n.translate('stackConnectors.connectorEvents.triggerDocumentation', {
            defaultMessage:
              'Subscribe with connector-id and optional KQL on event fields (e.g. event.body.eventType).',
          }),
        },
        snippets: {
          condition: 'event.connectorId: "your-connector-id"',
        },
      });
    }
  }
}
