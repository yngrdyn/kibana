/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';

import { dispatchConnectorEvents } from './dispatch_connector_events';

describe('dispatchConnectorEvents', () => {
  it('calls all registered emitters', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const params = {
      eventId: 'inboundWebhook.received',
      payload: { connectorId: 'c1' },
      spaceId: 'default',
      connectorId: 'c1',
      connectorTypeId: '.inboundWebhook',
    };

    await dispatchConnectorEvents({
      emitters: [{ emit }],
      params,
      logger: loggingSystemMock.create().get(),
    });

    expect(emit).toHaveBeenCalledWith(params);
  });

  it('warns when no emitters are registered', async () => {
    const logger = loggingSystemMock.create().get();

    await dispatchConnectorEvents({
      emitters: [],
      params: {
        eventId: 'inboundWebhook.received',
        payload: {},
        spaceId: 'default',
        connectorId: 'c1',
        connectorTypeId: '.inboundWebhook',
      },
      logger,
    });

    expect(logger.warn).toHaveBeenCalled();
  });
});
