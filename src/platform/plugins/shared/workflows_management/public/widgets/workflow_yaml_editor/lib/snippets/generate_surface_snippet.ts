/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowSurfaceDefinition } from '@kbn/workflows';
import { generateTriggerSnippet } from './generate_trigger_snippet';

export interface GenerateSurfaceSnippetOptions {
  full?: boolean;
  monacoSuggestionFormat?: boolean;
  withTriggersSection?: boolean;
  defaultCondition?: string;
  defaultConnectorId?: string;
}

/** Generates a YAML trigger snippet for a connector-event workflow surface id. */
export function generateSurfaceSnippet(
  surfaceId: string,
  options?: GenerateSurfaceSnippetOptions
): string {
  return generateTriggerSnippet(surfaceId, options);
}

/** Generates a YAML trigger snippet from a resolved workflow surface definition. */
export function generateSurfaceSnippetFromSurface(
  surface: Pick<WorkflowSurfaceDefinition, 'id'>,
  options?: GenerateSurfaceSnippetOptions
): string {
  return generateSurfaceSnippet(surface.id, options);
}
