/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAction } from '@reduxjs/toolkit';
import { ManualTestRun } from '.';
import { TestNowResponse } from '../../../../../common/types';
import { createAsyncAction } from '../utils/actions';

export const toggleTestNowFlyoutAction = createAction<string>('TOGGLE TEST NOW FLYOUT ACTION');
export const hideTestNowFlyoutAction = createAction('HIDE ALL TEST NOW FLYOUT ACTION');

export interface TestNowPayload {
  configId: string;
  name: string;
  spaceId?: string;
}
export const manualTestMonitorAction = createAsyncAction<
  TestNowPayload,
  TestNowResponse | undefined
>('TEST_NOW_MONITOR_ACTION');

export const manualTestRunUpdateAction = createAction<
  Partial<ManualTestRun> & { testRunId: string }
>('manualTestRunUpdateAction');

export const clearTestNowMonitorAction = createAction<string>('CLEAR_TEST_NOW_MONITOR_ACTION');
