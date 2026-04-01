/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AllowRecursiveTriggersItem } from './collect_allow_recursive_triggers_items';
import type { YamlValidationResult } from '../model/types';

const ALLOW_RECURSIVE_TRIGGERS_WARNING_MESSAGE =
  '`on.allowRecursiveTriggers: true` opts into recursive triggers: this workflow may run again when downstream events loop back to it. Only enable if that is intentional; otherwise you may get repeated or alternating runs until `maxEventChainDepth` is hit.';

/**
 * Warning when `on.allowRecursiveTriggers: true` so authors confirm intentional opt-out of the cycle guard.
 */
export const validateAllowRecursiveTriggers = (
  item: AllowRecursiveTriggersItem
): YamlValidationResult[] => [
  {
    id: `trigger-allow-recursive-triggers-${item.triggerIndex}-${item.startLineNumber}-${item.startColumn}`,
    owner: 'trigger-allow-recursive-triggers-validation',
    message: ALLOW_RECURSIVE_TRIGGERS_WARNING_MESSAGE,
    startLineNumber: item.startLineNumber,
    startColumn: item.startColumn,
    endLineNumber: item.endLineNumber,
    endColumn: item.endColumn,
    severity: 'warning',
    hoverMessage: ALLOW_RECURSIVE_TRIGGERS_WARNING_MESSAGE,
  },
];
