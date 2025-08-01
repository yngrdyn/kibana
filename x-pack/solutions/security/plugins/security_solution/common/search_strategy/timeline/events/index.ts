/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type * from './all';
export type * from './details';
export * from './last_event_time';
export type * from './eql';

export enum TimelineEventsQueries {
  all = 'eventsAll',
  details = 'eventsDetails',
  kpi = 'eventsKpi',
  lastEventTime = 'eventsLastEventTime',
}
