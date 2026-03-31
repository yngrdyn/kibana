/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TriggerReentryItem } from './collect_trigger_reentry_items';
import type { YamlValidationResult } from '../model/types';

const REENTRY_WARNING_MESSAGE =
  '`on.reentry: true` disables the event-chain cycle guard for this trigger. Only enable this if repeating the same workflow in the chain is intentional; otherwise you may get repeated or alternating runs until `maxEventChainDepth` is hit.';

/**
 * Warning when `on.reentry: true` so authors confirm intentional opt-out of cycle prevention.
 */
export const validateTriggerReentry = (item: TriggerReentryItem): YamlValidationResult[] => [
  {
    id: `trigger-reentry-${item.triggerIndex}-${item.startLineNumber}-${item.startColumn}`,
    owner: 'trigger-reentry-validation',
    message: REENTRY_WARNING_MESSAGE,
    startLineNumber: item.startLineNumber,
    startColumn: item.startColumn,
    endLineNumber: item.endLineNumber,
    endColumn: item.endColumn,
    severity: 'warning',
    hoverMessage: REENTRY_WARNING_MESSAGE,
  },
];
