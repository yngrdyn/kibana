/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { InstanceRef, WorkflowSurfaceDefinition } from '@kbn/workflows';
import { isDynamicConnector, resolveConnectorEventWorkflowSurface } from '@kbn/workflows';
import { getCachedAllConnectorsMap } from '../../common/schema';
import type { StepInfo, StepPropInfo } from '../entities/workflows/store';
import { getActionTypeIdFromStepType } from '../shared/lib/action_type_utils';
import {
  getTriggerBlockIndex,
  getTriggerConditionBlockIndex,
  getTriggerConnectorIdBlockIndex,
  getTriggerTypeAtIndex,
} from '../widgets/workflow_yaml_editor/lib/autocomplete/context/triggers_utils';
import { resolveConnectorIdStepType } from '../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/resolve_connector_id_step_type';

export type SurfaceCursorRole = 'trigger' | 'connector-id' | 'kql-filter';

export interface ResolvedSurfaceAtPath {
  readonly surface: WorkflowSurfaceDefinition;
  readonly role: SurfaceCursorRole;
}

export interface ResolveSurfaceAtPathOptions {
  readonly focusedStepInfo?: StepInfo | null;
  readonly focusedYamlPair?: StepPropInfo | null;
}

const isStepConnectorIdPath = (path: (string | number)[]): boolean =>
  path.length > 0 && path[0] === 'steps' && path[path.length - 1] === 'connector-id';

const resolveSurfaceRole = (path: (string | number)[]): SurfaceCursorRole | undefined => {
  if (getTriggerConnectorIdBlockIndex(path) !== null || isStepConnectorIdPath(path)) {
    return 'connector-id';
  }
  if (getTriggerConditionBlockIndex(path) !== null) {
    return 'kql-filter';
  }
  if (getTriggerBlockIndex(path) !== null) {
    return 'trigger';
  }
  return undefined;
};

const resolveTriggerSurfaceAtPath = (
  yamlDocument: Document,
  path: (string | number)[],
  role: SurfaceCursorRole
): ResolvedSurfaceAtPath | undefined => {
  const triggerIndex =
    getTriggerConnectorIdBlockIndex(path) ??
    getTriggerConditionBlockIndex(path) ??
    getTriggerBlockIndex(path);
  if (triggerIndex === null) {
    return undefined;
  }

  const triggerType = getTriggerTypeAtIndex(yamlDocument, triggerIndex);
  if (!triggerType) {
    return undefined;
  }

  const surface = resolveConnectorEventWorkflowSurface(triggerType);
  if (!surface) {
    return undefined;
  }

  return { surface, role };
};

const resolveStepConnectorIdSurface = (
  path: (string | number)[],
  focusedStepInfo: StepInfo | null,
  focusedYamlPair: StepPropInfo | null
): ResolvedSurfaceAtPath | undefined => {
  const lookupKey = resolveConnectorIdStepType(focusedStepInfo, path, focusedYamlPair);
  if (!lookupKey) {
    return undefined;
  }

  const connector = getCachedAllConnectorsMap()?.get(lookupKey);
  let connectorTypeId = lookupKey.startsWith('.')
    ? lookupKey
    : getActionTypeIdFromStepType(lookupKey);
  let instanceRef: InstanceRef = 'required';
  let title = lookupKey;
  let description = lookupKey;
  let stability: WorkflowSurfaceDefinition['stability'] = 'stable';

  if (connector && isDynamicConnector(connector)) {
    connectorTypeId = connector.actionTypeId;
    title = connector.displayName;
    description = connector.description ?? lookupKey;
    if (connector.stability) {
      stability = connector.stability;
    }
    if (connector.hasConnectorId === 'optional') {
      instanceRef = 'optional';
    } else if (connector.hasConnectorId === false) {
      return undefined;
    }
  } else if (focusedStepInfo?.stepType) {
    connectorTypeId = getActionTypeIdFromStepType(focusedStepInfo.stepType);
    const stepContract = getCachedAllConnectorsMap()?.get(focusedStepInfo.stepType);
    if (stepContract && isDynamicConnector(stepContract)) {
      connectorTypeId = stepContract.actionTypeId;
      title = stepContract.displayName;
      description = stepContract.description ?? focusedStepInfo.stepType;
      if (stepContract.stability) {
        stability = stepContract.stability;
      }
    }
  }

  return {
    role: 'connector-id',
    surface: {
      id: lookupKey,
      kind: 'step',
      title,
      description,
      stability,
      binding: {
        connectorTypeId,
        instanceRef,
      },
      surfaces: {},
    },
  };
};

/**
 * Resolves the workflow surface at the YAML cursor path for triggers and step connector-id fields.
 */
export const resolveSurfaceAtPath = (
  yamlDocument: Document,
  path: (string | number)[],
  options?: ResolveSurfaceAtPathOptions
): ResolvedSurfaceAtPath | undefined => {
  const role = resolveSurfaceRole(path);
  if (!role) {
    return undefined;
  }

  if (path[0] === 'triggers') {
    return resolveTriggerSurfaceAtPath(yamlDocument, path, role);
  }

  if (path[0] === 'steps' && role === 'connector-id') {
    return resolveStepConnectorIdSurface(
      path,
      options?.focusedStepInfo ?? null,
      options?.focusedYamlPair ?? null
    );
  }

  return undefined;
};
