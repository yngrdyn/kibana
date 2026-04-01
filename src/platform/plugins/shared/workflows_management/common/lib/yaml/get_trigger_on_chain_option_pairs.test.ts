/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { getTriggerNodes } from './get_trigger_nodes';
import { getTriggerOnChainOptionPairs } from './get_trigger_on_chain_option_pairs';

describe('getTriggerOnChainOptionPairs', () => {
  it('returns allowRecursiveTriggers pair when only that flag is true', () => {
    const doc = parseDocument(
      `triggers:
  - type: example.loopTrigger
    on:
      allowRecursiveTriggers: true
`
    );
    const [first] = getTriggerNodes(doc);
    expect(first).toBeDefined();
    const pairs = getTriggerOnChainOptionPairs(first.node);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.key.value).toBe('allowRecursiveTriggers');
  });

  it('returns skipWorkflowEmits pair when only that flag is true', () => {
    const doc = parseDocument(
      `triggers:
  - type: example.loopTrigger
    on:
      skipWorkflowEmits: true
`
    );
    const [first] = getTriggerNodes(doc);
    expect(first).toBeDefined();
    const pairs = getTriggerOnChainOptionPairs(first.node);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.key.value).toBe('skipWorkflowEmits');
  });

  it('returns both pairs when both are true', () => {
    const doc = parseDocument(
      `triggers:
  - type: example.loopTrigger
    on:
      allowRecursiveTriggers: true
      skipWorkflowEmits: true
`
    );
    const [first] = getTriggerNodes(doc);
    expect(first).toBeDefined();
    const pairs = getTriggerOnChainOptionPairs(first.node);
    expect(pairs).toHaveLength(2);
  });
});
