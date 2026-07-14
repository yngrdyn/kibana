/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import type { ConnectorTypeInfo } from '@kbn/workflows';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { z } from '@kbn/zod/v4';
import { buildRegisteredTriggerOptions } from './build_trigger_options';
import type { ActionOptionData } from '../types';
import { isActionGroup } from '../types';

const mockEventSchema = z.object({});

/**
 * Builds trigger menu options from connector types that declare inbound events
 * (ConnectorSpec.events), excluding ids already registered via workflows_extensions.
 */
export function buildConnectorEventTriggerOptions(
  connectorTypes: Record<string, ConnectorTypeInfo>,
  registeredTriggerIds: ReadonlySet<string>,
  euiTheme: UseEuiTheme['euiTheme']
): ActionOptionData[] {
  const connectorTypeByEventId = new Map<string, string>();
  const pseudoTriggers: PublicTriggerDefinition[] = [];

  for (const connectorType of Object.values(connectorTypes)) {
    for (const event of connectorType.events ?? []) {
      if (!registeredTriggerIds.has(event.eventId)) {
        connectorTypeByEventId.set(event.eventId, connectorType.actionTypeId);
        pseudoTriggers.push({
          id: event.eventId,
          title: event.title,
          description: event.description,
          stability: event.stability ?? 'tech_preview',
          eventSchema: mockEventSchema,
        });
      }
    }
  }

  if (pseudoTriggers.length === 0) {
    return [];
  }

  return mapOptionsToConnectorEvents(
    buildRegisteredTriggerOptions(pseudoTriggers, euiTheme),
    connectorTypeByEventId
  );
}

function mapOptionsToConnectorEvents(
  options: ActionOptionData[],
  connectorTypeByEventId: ReadonlyMap<string, string>
): ActionOptionData[] {
  return options.map((option) => {
    if (isActionGroup(option)) {
      return {
        ...option,
        options: mapOptionsToConnectorEvents(option.options, connectorTypeByEventId),
      };
    }

    const connectorType = connectorTypeByEventId.get(option.id);
    if (!connectorType) {
      return option;
    }

    return {
      id: option.id,
      label: option.label,
      description: option.description,
      connectorType,
      stability: option.stability,
    };
  });
}
