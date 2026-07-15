/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { connectorsSpecs, toRegisteredConnectorEvent } from '@kbn/connector-specs';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';

export function registerConnectorEventTriggers(
  workflowsExtensions?: WorkflowsExtensionsServerPluginSetup
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
        eventSchema: event.eventSchema,
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
