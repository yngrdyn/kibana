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
import { WORKFLOW_EVENTS_VALUES_SET } from '@kbn/workflows';

function isOnMapKey(key: Scalar): boolean {
  return key.value === 'on' || key.value === true;
}

/**
 * Pairs under `triggers[].on` for `workflowEvents` when set to a known enum string (`ignore`, `allow-all`, `avoid-loop`).
 */
export function getTriggerOnChainOptionPairs(node: YAMLMap): Array<Pair<Scalar, Scalar>> {
  const onPair = node.items.find(
    (item): item is Pair<Scalar, unknown> =>
      isPair(item) && isScalar(item.key) && isOnMapKey(item.key)
  );
  if (onPair === undefined || !isMap(onPair.value)) {
    return [];
  }
  const onMap = onPair.value;
  const out: Array<Pair<Scalar, Scalar>> = [];
  for (const item of onMap.items) {
    if (isPair(item) && isScalar(item.key) && isScalar(item.value)) {
      const key = item.key.value;
      const val = item.value.value;
      if (
        key === 'workflowEvents' &&
        typeof val === 'string' &&
        WORKFLOW_EVENTS_VALUES_SET.has(val)
      ) {
        out.push(item as Pair<Scalar, Scalar>);
      }
    }
  }
  return out;
}
