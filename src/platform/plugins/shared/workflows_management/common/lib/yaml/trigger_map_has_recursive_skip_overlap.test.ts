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
import { triggerMapHasRecursiveSkipOverlapOn } from './trigger_map_has_recursive_skip_overlap';

describe('triggerMapHasRecursiveSkipOverlapOn', () => {
  it('returns false when only skipWorkflowEmits is true', () => {
    const doc = parseDocument(
      `triggers:
  - type: example.loopTrigger
    on:
      skipWorkflowEmits: true
`
    );
    const [first] = getTriggerNodes(doc);
    expect(first).toBeDefined();
    expect(triggerMapHasRecursiveSkipOverlapOn(first.node)).toBe(false);
  });

  it('returns true when both flags are true', () => {
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
    expect(triggerMapHasRecursiveSkipOverlapOn(first.node)).toBe(true);
  });

  it('returns false when allowRecursiveTriggers is string true', () => {
    const doc = parseDocument(
      `triggers:
  - type: example.loopTrigger
    on:
      allowRecursiveTriggers: "true"
      skipWorkflowEmits: true
`
    );
    const [first] = getTriggerNodes(doc);
    expect(first).toBeDefined();
    expect(triggerMapHasRecursiveSkipOverlapOn(first.node)).toBe(false);
  });
});
