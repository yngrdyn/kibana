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
import {
  type ConnectorIdBinding,
  resolveConnectorIdBindingFromStepType,
  resolveConnectorIdBindingFromSurface,
} from './connector_id_binding';
import { resolveSurfaceAtPath } from './resolve_surface_at_path';
import type { StepInfo, StepPropInfo } from '../entities/workflows/store';
import { resolveConnectorIdStepType } from '../widgets/workflow_yaml_editor/lib/autocomplete/suggestions/connector_id/resolve_connector_id_step_type';

export interface ConnectorIdProviderContext {
  readonly yamlDocument: Document;
  readonly path: ReadonlyArray<string | number>;
  readonly focusedStepInfo: StepInfo | null;
  readonly focusedYamlPair: StepPropInfo | null;
}

/**
 * Resolves the workflow surface for connector-id autocomplete at the cursor path.
 */
export const resolveConnectorIdSurface = (
  yamlDocument: Document,
  path: ReadonlyArray<string | number>,
  focusedStepInfo: StepInfo | null = null,
  focusedYamlPair: StepPropInfo | null = null
): WorkflowSurfaceDefinition | undefined =>
  resolveSurfaceAtPath(yamlDocument, [...path], { focusedStepInfo, focusedYamlPair })?.surface;

/**
 * Resolves connector-id binding through workflow surfaces first, then legacy step fallback.
 */
export const resolveConnectorIdBinding = (
  context: ConnectorIdProviderContext
): ConnectorIdBinding | undefined => {
  const surface = resolveConnectorIdSurface(
    context.yamlDocument,
    context.path,
    context.focusedStepInfo,
    context.focusedYamlPair
  );
  if (surface) {
    const binding = resolveConnectorIdBindingFromSurface(surface);
    if (binding) {
      return binding;
    }
  }

  const stepType = resolveConnectorIdStepType(
    context.focusedStepInfo,
    context.path,
    context.focusedYamlPair
  );
  if (!stepType) {
    return undefined;
  }

  return resolveConnectorIdBindingFromStepType(stepType);
};

/**
 * @deprecated Prefer {@link resolveConnectorIdBinding} — kept for callers that only need the lookup key.
 */
export const resolveConnectorIdActionTypeId = (
  context: ConnectorIdProviderContext
): string | null => resolveConnectorIdBinding(context)?.lookupKey ?? null;
