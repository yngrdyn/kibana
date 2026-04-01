/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { YAMLMap } from 'yaml';
import { getTriggerOnChainOptionPairs } from './get_trigger_on_chain_option_pairs';

/**
 * True when a trigger map's `on` block sets both `allowRecursiveTriggers: true` and `skipWorkflowEmits: true`.
 */
export function triggerMapHasRecursiveSkipOverlapOn(node: YAMLMap): boolean {
  const pairs = getTriggerOnChainOptionPairs(node);
  let hasAllow = false;
  let hasSkip = false;
  for (const pair of pairs) {
    const key = pair.key.value;
    if (key === 'allowRecursiveTriggers') {
      hasAllow = true;
    } else if (key === 'skipWorkflowEmits') {
      hasSkip = true;
    }
  }
  return hasAllow && hasSkip;
}
