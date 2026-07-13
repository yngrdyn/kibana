/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { WorkflowEventsSchema } from './workflow_events_schema';

/** Schema for the `on` block of custom triggers (KQL condition to filter when the workflow runs). */
export const CustomTriggerOnSchema = z
  .object({
    condition: z.string().optional(),
    /**
     * How this trigger responds when the event was emitted from a workflow-attributed chain:
     * `ignore` — do not schedule;
     * `avoid-loop` — schedule with cycle guard (default when omitted);
     * `allow-all` — schedule without cycle guard (max chain depth still applies).
     */
    workflowEvents: WorkflowEventsSchema.optional(),
  })
  .optional();
