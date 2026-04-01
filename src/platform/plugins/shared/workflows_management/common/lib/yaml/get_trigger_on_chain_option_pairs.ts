/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Pair, Scalar, YAMLMap } from 'yaml';
import { isMap, isPair, isScalar } from 'yaml';

const TRIGGER_ON_CHAIN_KEYS = new Set<string>(['allowRecursiveTriggers', 'skipWorkflowEmits']);

/**
 * Pairs under `triggers[].on` for `allowRecursiveTriggers: true` or `skipWorkflowEmits: true`.
 */
export function getTriggerOnChainOptionPairs(node: YAMLMap): Array<Pair<Scalar, Scalar>> {
  const onPair = node.items.find(
    (item): item is Pair<Scalar, unknown> =>
      isPair(item) && isScalar(item.key) && item.key.value === 'on'
  );
  if (onPair === undefined || !isMap(onPair.value)) {
    return [];
  }
  const onMap = onPair.value;
  const out: Array<Pair<Scalar, Scalar>> = [];
  for (const item of onMap.items) {
    if (isPair(item) && isScalar(item.key) && isScalar(item.value)) {
      const key = item.key.value;
      if (TRIGGER_ON_CHAIN_KEYS.has(key as string) && item.value.value === true) {
        out.push(item as Pair<Scalar, Scalar>);
      }
    }
  }
  return out;
}
