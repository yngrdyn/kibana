/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { validateTriggerReentry } from './validate_trigger_reentry';

describe('validateTriggerReentry', () => {
  it('returns a warning with expected owner and severity', () => {
    const [result] = validateTriggerReentry({
      triggerIndex: 0,
      startLineNumber: 4,
      startColumn: 7,
      endLineNumber: 4,
      endColumn: 20,
      yamlPath: ['triggers', 0, 'on', 'reentry'],
    });

    expect(result).toMatchObject({
      owner: 'trigger-reentry-validation',
      severity: 'warning',
      startLineNumber: 4,
      startColumn: 7,
      endLineNumber: 4,
      endColumn: 20,
    });
    expect(result?.message).toContain('cycle guard');
    expect(result?.message).toContain('intentional');
    expect(result?.hoverMessage).toBe(result?.message);
  });
});
