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
 * Resolves the action type id used to filter connector instances for `connector-id` autocomplete.
 * Prefers connector-event trigger surfaces; falls back to legacy step connector resolution.
 */
export const resolveConnectorIdActionTypeId = ({
  yamlDocument,
  path,
  focusedStepInfo,
  focusedYamlPair,
}: ConnectorIdProviderContext): string | null => {
  if (path.length > 0) {
    const resolvedSurface = resolveSurfaceAtPath(yamlDocument, [...path]);
    const connectorTypeId = resolvedSurface?.surface.binding.connectorTypeId;
    if (connectorTypeId) {
      return connectorTypeId;
    }
  }

  return resolveConnectorIdStepType(focusedStepInfo, path, focusedYamlPair);
};

export const resolveConnectorIdSurface = (
  yamlDocument: Document,
  path: ReadonlyArray<string | number>
): WorkflowSurfaceDefinition | undefined => resolveSurfaceAtPath(yamlDocument, [...path])?.surface;
