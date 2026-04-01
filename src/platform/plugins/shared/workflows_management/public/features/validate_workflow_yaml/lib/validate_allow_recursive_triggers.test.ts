/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { validateAllowRecursiveTriggers } from './validate_allow_recursive_triggers';

describe('validateAllowRecursiveTriggers', () => {
  it('returns a warning with expected owner and severity', () => {
    const [result] = validateAllowRecursiveTriggers({
      triggerIndex: 0,
      startLineNumber: 4,
      startColumn: 7,
      endLineNumber: 4,
      endColumn: 35,
      yamlPath: ['triggers', 0, 'on', 'allowRecursiveTriggers'],
    });

    expect(result).toMatchObject({
      owner: 'trigger-allow-recursive-triggers-validation',
      severity: 'warning',
      startLineNumber: 4,
      startColumn: 7,
      endLineNumber: 4,
      endColumn: 35,
    });
    expect(result?.message).toContain('recursive triggers');
    expect(result?.message).toContain('intentional');
    expect(result?.hoverMessage).toBe(result?.message);
  });
});
