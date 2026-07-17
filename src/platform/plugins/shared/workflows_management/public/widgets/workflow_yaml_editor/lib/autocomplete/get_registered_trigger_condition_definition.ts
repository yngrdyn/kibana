/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { getTriggerConditionDefinition } from '../../../../workflow_surface/kql_filter_provider';

/**
 * When `path` is `triggers[i].on.condition` and `triggers[i].type` resolves to a trigger registered
 * in workflows extensions or a connector-event trigger, returns its public definition; otherwise `undefined`.
 */
export function getRegisteredTriggerConditionDefinition(
  yamlDocument: Document,
  path: (string | number)[]
): PublicTriggerDefinition | undefined {
  return getTriggerConditionDefinition(yamlDocument, path);
}
