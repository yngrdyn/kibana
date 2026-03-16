/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { registerGetEventDrivenStatusRoute } from './get_event_driven_status';
import { createMockRouterInstance, getIsEventDrivenExecutionEnabledMock } from './test_utils';
import { EVENT_DRIVEN_STATUS_PATH } from '../../../common/routes';

jest.mock('../lib/with_license_check', () => ({
  withLicenseCheck: (handler: Function) => handler,
}));

describe(`GET ${EVENT_DRIVEN_STATUS_PATH}`, () => {
  let mockRouter: ReturnType<typeof createMockRouterInstance>;
  let routeHandler: (context: unknown, request: unknown, response: any) => Promise<unknown>;

  beforeEach(() => {
    mockRouter = createMockRouterInstance();
    registerGetEventDrivenStatusRoute({
      router: mockRouter,
      getIsEventDrivenExecutionEnabled: getIsEventDrivenExecutionEnabledMock,
    });
    const getCall = (mockRouter.get as jest.Mock).mock.calls.find(
      (call: unknown[]) => (call[0] as { path?: string })?.path === EVENT_DRIVEN_STATUS_PATH
    );
    routeHandler = getCall?.[1];
  });

  it('returns eventDrivenExecutionEnabled true when getter returns true', async () => {
    const mockResponse = { ok: jest.fn().mockReturnThis() };
    await routeHandler(null, {} as any, mockResponse);
    expect(mockResponse.ok).toHaveBeenCalledTimes(1);
    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: { eventDrivenExecutionEnabled: true },
    });
  });

  it('returns eventDrivenExecutionEnabled false when getter returns false', async () => {
    mockRouter = createMockRouterInstance();
    registerGetEventDrivenStatusRoute({
      router: mockRouter,
      getIsEventDrivenExecutionEnabled: () => false,
    });
    const getCall = (mockRouter.get as jest.Mock).mock.calls.find(
      (call: unknown[]) => (call[0] as { path?: string })?.path === EVENT_DRIVEN_STATUS_PATH
    );
    const handler = getCall?.[1];
    const mockResponse = { ok: jest.fn().mockReturnThis() };
    await handler(null, {} as any, mockResponse);
    expect(mockResponse.ok).toHaveBeenCalledTimes(1);
    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: { eventDrivenExecutionEnabled: false },
    });
  });
});
