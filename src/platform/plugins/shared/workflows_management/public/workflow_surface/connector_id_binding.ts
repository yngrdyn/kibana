/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ConnectorInstance,
  ConnectorTypeInfo,
  WorkflowSurfaceDefinition,
} from '@kbn/workflows';
import { getActionTypeIdFromStepType } from '../shared/lib/action_type_utils';
import {
  getCustomStepConnectorIdSelectionHandler,
  getInferenceConnectorTaskTypeFromSubAction,
} from '../shared/lib/connectors_utils';

/**
 * Resolved WHO binding for `connector-id` autocomplete — from a workflow surface or step fallback.
 */
export interface ConnectorIdBinding {
  readonly connectorTypeId: string;
  /** When true, only connector types that declare ConnectorSpec.events are eligible. */
  readonly requireConnectorTypeEvents: boolean;
  /** Lookup key passed to connector instance resolution (step type or action type id). */
  readonly lookupKey: string;
}

export function resolveConnectorIdBindingFromSurface(
  surface: WorkflowSurfaceDefinition
): ConnectorIdBinding | undefined {
  const { connectorTypeId, instanceRef } = surface.binding;
  if (!connectorTypeId || instanceRef === 'none') {
    return undefined;
  }

  return {
    connectorTypeId,
    requireConnectorTypeEvents: surface.source?.type === 'connector-event',
    lookupKey: connectorTypeId,
  };
}

export function resolveConnectorIdBindingFromStepType(stepType: string): ConnectorIdBinding {
  return {
    connectorTypeId: getActionTypeIdFromStepType(stepType),
    requireConnectorTypeEvents: false,
    lookupKey: stepType,
  };
}

export function connectorTypeHasDeclaredEvents(
  connectorTypeId: string,
  connectorTypes: Record<string, ConnectorTypeInfo>
): boolean {
  const connectorTypeInfo = connectorTypes[connectorTypeId];
  return (connectorTypeInfo?.events?.length ?? 0) > 0;
}

/**
 * Lists connector instances eligible for the resolved binding.
 * Connector-event surfaces only return instances when the bound type declares events.
 */
export function listConnectorInstancesForBinding(
  binding: ConnectorIdBinding,
  connectorTypes: Record<string, ConnectorTypeInfo>
): Array<ConnectorInstance & { connectorType: string }> {
  if (
    binding.requireConnectorTypeEvents &&
    !connectorTypeHasDeclaredEvents(binding.connectorTypeId, connectorTypes)
  ) {
    return [];
  }

  return listConnectorInstancesForLookupKey(binding.lookupKey, connectorTypes);
}

function listConnectorInstancesForLookupKey(
  lookupKey: string,
  connectorTypes: Record<string, ConnectorTypeInfo>
): Array<ConnectorInstance & { connectorType: string }> {
  const customStepSelectionHandler = getCustomStepConnectorIdSelectionHandler(lookupKey);
  const connectorTypesToQuery = customStepSelectionHandler?.connectorTypes ?? [lookupKey];

  return connectorTypesToQuery.flatMap((connectorType) => {
    const cleanStepType = connectorType.startsWith('.') ? connectorType.slice(1) : connectorType;
    const [baseConnectorType, subAction] = cleanStepType.split('.');
    const actionTypeId = getActionTypeIdFromStepType(baseConnectorType);
    const connectorTypeInfo = connectorTypes[actionTypeId];

    if (!connectorTypeInfo?.instances?.length) {
      return [];
    }

    let instances = connectorTypeInfo.instances;
    if (baseConnectorType === 'inference' && subAction) {
      const taskType = getInferenceConnectorTaskTypeFromSubAction(subAction);
      if (taskType) {
        instances = instances.filter(({ config }) => config?.taskType === taskType);
      }
    }

    return instances.map((instance) => ({
      ...instance,
      connectorType: connectorTypeInfo.actionTypeId,
    }));
  });
}
