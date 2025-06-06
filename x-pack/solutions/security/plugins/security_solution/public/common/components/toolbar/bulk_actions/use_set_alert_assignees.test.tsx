/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useAppToasts } from '../../../hooks/use_app_toasts';
import { useSetAlertAssignees } from './use_set_alert_assignees';

jest.mock('../../../hooks/use_app_toasts');

describe('useSetAlertAssignees', () => {
  it('should return a function', () => {
    (useAppToasts as jest.Mock).mockReturnValue({
      addSuccess: jest.fn(),
      addError: jest.fn(),
    });

    const { result } = renderHook(() => useSetAlertAssignees());

    expect(typeof result.current).toEqual('function');
  });
});
