/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RootSchema } from '@kbn/core/server';

export const WORKFLOWS_TRIGGER_EVENT_DISPATCHED = 'workflows_trigger_event_dispatched';

export interface TriggerEventDispatchedTelemetryEvent {
  triggerId: string;
  executionEnabled: boolean;
  logEventsEnabled: boolean;
  earlyExit: boolean;
  /** True when execution is off but trigger-event audit logging still runs. */
  auditOnly: boolean;
  subscribedCount: number;
  disabledCount: number;
  kqlFalseCount: number;
  kqlErrorCount: number;
  matchedCount: number;
  depthSkippedCount: number;
  scheduledAttemptCount: number;
  scheduledSuccessCount: number;
  scheduledFailureCount: number;
}

export const triggerEventDispatchedSchema: RootSchema<TriggerEventDispatchedTelemetryEvent> = {
  triggerId: {
    type: 'keyword',
    _meta: {
      description: 'Event trigger id handled by workflows trigger event handler',
      optional: false,
    },
  },
  executionEnabled: {
    type: 'boolean',
    _meta: { description: 'Whether event-driven execution is enabled', optional: false },
  },
  logEventsEnabled: {
    type: 'boolean',
    _meta: { description: 'Whether trigger event audit logging is enabled', optional: false },
  },
  earlyExit: {
    type: 'boolean',
    _meta: { description: 'True when handler exits before resolution/scheduling', optional: false },
  },
  auditOnly: {
    type: 'boolean',
    _meta: {
      description:
        'True when event-driven execution is disabled but trigger event logging still ran (audit path)',
      optional: false,
    },
  },
  subscribedCount: {
    type: 'integer',
    _meta: { description: 'Number of subscribed workflows returned from storage', optional: false },
  },
  disabledCount: {
    type: 'integer',
    _meta: {
      description: 'Number of subscribed workflows skipped because disabled',
      optional: false,
    },
  },
  kqlFalseCount: {
    type: 'integer',
    _meta: { description: 'Number of workflows filtered out by KQL false result', optional: false },
  },
  kqlErrorCount: {
    type: 'integer',
    _meta: {
      description: 'Number of workflows filtered out by KQL evaluation error',
      optional: false,
    },
  },
  matchedCount: {
    type: 'integer',
    _meta: {
      description: 'Number of workflows matched after enabled + KQL checks',
      optional: false,
    },
  },
  depthSkippedCount: {
    type: 'integer',
    _meta: {
      description: 'Number of matched workflows skipped by max event chain depth',
      optional: false,
    },
  },
  scheduledAttemptCount: {
    type: 'integer',
    _meta: { description: 'Number of schedule attempts sent to execution engine', optional: false },
  },
  scheduledSuccessCount: {
    type: 'integer',
    _meta: { description: 'Number of successful schedule calls', optional: false },
  },
  scheduledFailureCount: {
    type: 'integer',
    _meta: { description: 'Number of failed schedule calls', optional: false },
  },
};
