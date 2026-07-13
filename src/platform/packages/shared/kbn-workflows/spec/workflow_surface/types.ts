/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import type { StabilityLevel } from '../../types/v1';

export type WorkflowSurfaceKind = 'step' | 'trigger';

export type InstanceRef = 'required' | 'optional' | 'none';

export interface WorkflowSurfaceBinding {
  readonly connectorTypeId?: string;
  readonly instanceRef: InstanceRef;
}

export interface WorkflowSurfaceFilter {
  readonly schema: z.ZodObject;
  readonly language: 'kql';
  /** YAML path for filter expressions on this surface. */
  readonly yamlPath: 'on.condition';
}

export interface WorkflowSurfaceSource {
  readonly type: 'connector-event';
  readonly connectorTypeId: string;
  readonly eventKey: string;
}

export interface WorkflowSurfaceDefinition {
  readonly id: string;
  readonly kind: WorkflowSurfaceKind;
  readonly title: string;
  readonly description: string;
  readonly stability: StabilityLevel;
  readonly binding: WorkflowSurfaceBinding;
  readonly surfaces: {
    readonly input?: z.ZodObject;
    readonly config?: z.ZodObject;
    readonly filter?: WorkflowSurfaceFilter;
  };
  readonly documentation?: { readonly examples?: string[] };
  /** Workflows editor snippets (e.g. default KQL condition). Not set by connector specs. */
  readonly snippets?: { readonly condition?: string };
  readonly source?: WorkflowSurfaceSource;
}
