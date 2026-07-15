/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConnectorInstance, ConnectorTypeInfo } from '@kbn/workflows';
import { getActionTypeIdFromStepType } from '../shared/lib/action_type_utils';
import {
  getCustomStepConnectorIdSelectionHandler,
  getInferenceConnectorTaskTypeFromSubAction,
} from '../shared/lib/connectors_utils';

/**
 * Resolved WHO binding for `connector-id` autocomplete — from a trigger event or step.
 */
export interface ConnectorIdBinding {
  readonly connectorTypeId: string;
  readonly lookupKey: string;
}

export function resolveConnectorIdBindingFromStepType(stepType: string): ConnectorIdBinding {
  return {
    connectorTypeId: getActionTypeIdFromStepType(stepType),
    lookupKey: stepType,
  };
}

export function listConnectorInstancesForBinding(
  binding: ConnectorIdBinding,
  connectorTypes: Record<string, ConnectorTypeInfo>
): Array<ConnectorInstance & { connectorType: string }> {
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
