/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { WorkflowSurfaceDefinition } from '@kbn/workflows';
import { resolveConnectorEventWorkflowSurface } from '@kbn/workflows';
import {
  getTriggerBlockIndex,
  getTriggerConditionBlockIndex,
  getTriggerConnectorIdBlockIndex,
  getTriggerTypeAtIndex,
} from '../widgets/workflow_yaml_editor/lib/autocomplete/context/triggers_utils';

export type SurfaceCursorRole = 'trigger' | 'connector-id' | 'kql-filter';

export interface ResolvedSurfaceAtPath {
  readonly surface: WorkflowSurfaceDefinition;
  readonly role: SurfaceCursorRole;
}

const resolveSurfaceRole = (path: (string | number)[]): SurfaceCursorRole | undefined => {
  if (getTriggerConnectorIdBlockIndex(path) !== null) {
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

/**
 * Resolves the workflow surface for a connector-event trigger at the YAML cursor path.
 * v1: trigger blocks only; step surfaces fall back to legacy connector contracts.
 */
export const resolveSurfaceAtPath = (
  yamlDocument: Document,
  path: (string | number)[]
): ResolvedSurfaceAtPath | undefined => {
  const role = resolveSurfaceRole(path);
  if (!role) {
    return undefined;
  }

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
