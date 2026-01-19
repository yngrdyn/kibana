/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CommonTriggerDefinition } from '../../common/trigger_registry/types';

/**
 * Server-side trigger definition.
 * Extends CommonTriggerDefinition (same as steps extend CommonStepDefinition).
 *
 * @example
 * ```typescript
 * const myTriggerDefinition: TriggerDefinition = {
 *   id: 'custom.myTrigger',
 *   description: 'Emitted when a custom event occurs',
 *   eventSchema: z.object({
 *     eventId: z.string(),
 *     timestamp: z.string(),
 *   }),
 * };
 * ```
 */
export type TriggerDefinition = CommonTriggerDefinition;
