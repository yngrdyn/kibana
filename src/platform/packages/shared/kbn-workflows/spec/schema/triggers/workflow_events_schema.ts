/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

/** Allowed values for `on.workflowEvents` on custom (event-driven) triggers. */
export const WORKFLOW_EVENTS_VALUES = ['ignore', 'allow-all', 'avoid-loop'] as const;
export type WorkflowEventsValue = (typeof WORKFLOW_EVENTS_VALUES)[number];
export const WORKFLOW_EVENTS_VALUES_SET = new Set<string>(WORKFLOW_EVENTS_VALUES);
export const WorkflowEventsSchema = z.enum(WORKFLOW_EVENTS_VALUES);
