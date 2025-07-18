/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable dot-notation */
import * as rxOp from 'rxjs';
import moment from 'moment';
import { loggingSystemMock, coreMock } from '@kbn/core/server/mocks';
import { UsageCountersService } from './usage_counters_service';

jest.mock('./rollups', () => ({
  ...jest.requireActual('./rollups'),
  // used by `rollUsageCountersIndices` to determine if a counter is beyond the retention period
  registerUsageCountersRollups: jest.fn(),
}));

import { registerUsageCountersRollups } from './rollups';

const registerUsageCountersRollupsMock = registerUsageCountersRollups as jest.MockedFunction<
  typeof registerUsageCountersRollups
>;

// optionally advance test timers after a delay
const tickWithDelay = (delay = 1) => {
  jest.useRealTimers();
  return new Promise((resolve) => setTimeout(resolve, delay));
};

describe('UsageCountersService', () => {
  const retryCount = 1;
  const bufferDurationMs = 100;
  const mockNow = 1617954426939;
  const logger = loggingSystemMock.createLogger();
  const coreSetup = coreMock.createSetup();
  const coreStart = coreMock.createStart();

  beforeEach(() => {
    jest.spyOn(moment, 'now').mockReturnValue(mockNow);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('stores data in cache during setup', async () => {
    const usageCountersService = new UsageCountersService({ logger, retryCount, bufferDurationMs });
    const { createUsageCounter } = usageCountersService.setup(coreSetup);

    const usageCounter = createUsageCounter('test-counter');

    usageCounter.incrementCounter({ counterName: 'counterA' });
    usageCounter.incrementCounter({ counterName: 'counterA', namespace: 'second', source: 'ui' });

    const dataInSourcePromise = rxOp.firstValueFrom(
      usageCountersService['source$'].pipe(rxOp.toArray())
    );
    usageCountersService['flushCache$'].next();
    usageCountersService['source$'].complete();
    await expect(dataInSourcePromise).resolves.toHaveLength(2);
  });

  it('registers savedObject types during setup', () => {
    const usageCountersService = new UsageCountersService({ logger, retryCount, bufferDurationMs });
    usageCountersService.setup(coreSetup);
    expect(coreSetup.savedObjects.registerType).toBeCalledTimes(2);
  });

  it('triggers regular cleanup of old counters on start', () => {
    const usageCountersService = new UsageCountersService({ logger, retryCount, bufferDurationMs });
    usageCountersService.start(coreStart);

    expect(registerUsageCountersRollupsMock).toHaveBeenCalledTimes(1);
    expect(registerUsageCountersRollupsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: expect.any(Object),
        getRegisteredUsageCounters: expect.any(Function),
        internalRepository: expect.any(Object),
      })
    );
  });

  it('flushes cached data on start', async () => {
    const usageCountersService = new UsageCountersService({ logger, retryCount, bufferDurationMs });

    const mockRepository = coreStart.savedObjects.createInternalRepository();
    const mockIncrementCounter = jest.fn();
    mockRepository.incrementCounter = mockIncrementCounter;

    coreStart.savedObjects.createInternalRepository.mockReturnValue(mockRepository);
    const { createUsageCounter } = usageCountersService.setup(coreSetup);

    const usageCounter = createUsageCounter('test-counter');

    usageCounter.incrementCounter({ counterName: 'counterA' });
    usageCounter.incrementCounter({ counterName: 'counterA', namespace: 'second', source: 'ui' });

    const dataInSourcePromise = rxOp.firstValueFrom(
      usageCountersService['source$'].pipe(rxOp.toArray())
    );
    usageCountersService.start(coreStart);
    usageCountersService['source$'].complete();

    await expect(dataInSourcePromise).resolves.toMatchInlineSnapshot(`
      Array [
        Object {
          "counterName": "counterA",
          "counterType": "count",
          "domainId": "test-counter",
          "incrementBy": 1,
          "source": "server",
        },
        Object {
          "counterName": "counterA",
          "counterType": "count",
          "domainId": "test-counter",
          "incrementBy": 1,
          "namespace": "second",
          "source": "ui",
        },
      ]
    `);
  });

  it('buffers data into savedObject', async () => {
    const usageCountersService = new UsageCountersService({ logger, retryCount, bufferDurationMs });

    const mockRepository = coreStart.savedObjects.createInternalRepository();
    const mockIncrementCounter = jest.fn().mockResolvedValue('success');
    mockRepository.incrementCounter = mockIncrementCounter;

    coreStart.savedObjects.createInternalRepository.mockReturnValue(mockRepository);
    const { createUsageCounter } = usageCountersService.setup(coreSetup);
    jest.useFakeTimers();
    const usageCounter = createUsageCounter('test-counter');

    usageCounter.incrementCounter({ counterName: 'counterA' });
    usageCounter.incrementCounter({ counterName: 'counterA' });

    usageCountersService.start(coreStart);
    usageCounter.incrementCounter({ counterName: 'counterA' });
    usageCounter.incrementCounter({ counterName: 'counterB' });
    jest.runOnlyPendingTimers();
    expect(mockIncrementCounter).toBeCalledTimes(2);
    expect(mockIncrementCounter.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "usage-counter",
          "test-counter:counterA:count:server:20210409",
          Array [
            Object {
              "fieldName": "count",
              "incrementBy": 3,
            },
          ],
          Object {
            "refresh": false,
            "upsertAttributes": Object {
              "counterName": "counterA",
              "counterType": "count",
              "domainId": "test-counter",
              "source": "server",
            },
          },
        ],
        Array [
          "usage-counter",
          "test-counter:counterB:count:server:20210409",
          Array [
            Object {
              "fieldName": "count",
              "incrementBy": 1,
            },
          ],
          Object {
            "refresh": false,
            "upsertAttributes": Object {
              "counterName": "counterB",
              "counterType": "count",
              "domainId": "test-counter",
              "source": "server",
            },
          },
        ],
      ]
    `);
  });
  //  requires extended test runtime because of exponential backoff delay for retries
  it(
    'retries errors by `retryCount` times before failing to store',
    async () => {
      const retryConst = 2;
      const usageCountersService = new UsageCountersService({
        logger,
        retryCount: retryConst,
        bufferDurationMs: 50000,
      });

      const mockRepository = coreStart.savedObjects.createInternalRepository();
      const mockError = new Error('failed');
      const mockIncrementCounter = jest.fn().mockImplementation((_, key) => {
        switch (key) {
          case 'test-counter:counterA:count:server:20210409':
            throw mockError;
          case 'test-counter:counterB:count:server:20210409':
            return 'pass';
          default:
            throw new Error(`unknown key ${key}`);
        }
      });

      mockRepository.incrementCounter = mockIncrementCounter;

      coreStart.savedObjects.createInternalRepository.mockReturnValue(mockRepository);
      const { createUsageCounter } = usageCountersService.setup(coreSetup);
      jest.useFakeTimers();
      const usageCounter = createUsageCounter('test-counter');

      usageCountersService.start(coreStart);
      usageCounter.incrementCounter({ counterName: 'counterA' });
      usageCounter.incrementCounter({ counterName: 'counterB' });
      jest.runOnlyPendingTimers();

      // wait for retries to kick in on next scheduler call
      await tickWithDelay(5000);
      // number of incrementCounter calls + number of retries
      expect(mockIncrementCounter).toBeCalledTimes(2 + retryConst);
      // assert counterA increment error warning logs
      expect(logger.debug).toHaveBeenNthCalledWith(
        2,
        `${mockError}, retrying attempt ${retryConst}`
      );
      expect(logger.warn).toHaveBeenNthCalledWith(1, mockError);
      expect(logger.debug).toHaveBeenNthCalledWith(3, 'Store counters into savedObjects', {
        kibana: {
          usageCounters: {
            results: [mockError, 'pass'],
          },
        },
      });
    },
    10 * 1000
  );

  it('buffers counters within `bufferDurationMs` time', async () => {
    const usageCountersService = new UsageCountersService({
      logger,
      retryCount,
      bufferDurationMs: 30000,
    });

    const mockRepository = coreStart.savedObjects.createInternalRepository();
    const mockIncrementCounter = jest.fn().mockImplementation((_data, key, counter) => {
      expect(counter).toHaveLength(1);
      return { key, incrementBy: counter[0].incrementBy };
    });

    mockRepository.incrementCounter = mockIncrementCounter;

    coreStart.savedObjects.createInternalRepository.mockReturnValue(mockRepository);

    const { createUsageCounter } = usageCountersService.setup(coreSetup);
    jest.useFakeTimers();
    const usageCounter = createUsageCounter('test-counter');

    usageCountersService.start(coreStart);
    usageCounter.incrementCounter({ counterName: 'counterA' });
    usageCounter.incrementCounter({ counterName: 'counterA' });
    jest.advanceTimersByTime(30000);

    usageCounter.incrementCounter({ counterName: 'counterA' });
    jest.runOnlyPendingTimers();

    // wait for debounce to kick in on next scheduler call
    await tickWithDelay();
    expect(mockIncrementCounter).toBeCalledTimes(2);
    expect(mockIncrementCounter.mock.results.map(({ value }) => value)).toMatchInlineSnapshot(`
      Array [
        Object {
          "incrementBy": 2,
          "key": "test-counter:counterA:count:server:20210409",
        },
        Object {
          "incrementBy": 1,
          "key": "test-counter:counterA:count:server:20210409",
        },
      ]
    `);
  });
});
