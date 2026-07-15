/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';

import { registerWorkflowsConnectorEventEmitter } from './register_workflows_connector_event_emitter';

describe('registerWorkflowsConnectorEventEmitter', () => {
  it('registers an emitter that forwards to workflows emitEvent', async () => {
    const actions = actionsMock.createSetup();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const getClient = jest.fn().mockResolvedValue({ emitEvent });

    registerWorkflowsConnectorEventEmitter({
      actions,
      getWorkflowsExtensionsStart: async () => ({ getClient } as never),
      logger: loggingSystemMock.create().get(),
    });

    expect(actions.registerConnectorEventEmitter).toHaveBeenCalledTimes(1);
    const emitter = actions.registerConnectorEventEmitter.mock.calls[0][0];

    await emitter.emit({
      eventId: 'inboundWebhook.received',
      payload: { connectorId: 'c1', body: {} },
      spaceId: 'default',
      connectorId: 'c1',
      connectorTypeId: '.inboundWebhook',
      authorizationHeader: 'ApiKey dGVzdDp0ZXN0',
    });

    expect(getClient).toHaveBeenCalled();
    const requestArg = getClient.mock.calls[0][0];
    expect(requestArg.headers.authorization).toBe('ApiKey dGVzdDp0ZXN0');
    expect(emitEvent).toHaveBeenCalledWith('inboundWebhook.received', {
      connectorId: 'c1',
      body: {},
    });
  });

  it('emits with empty auth headers when authorizationHeader is omitted', async () => {
    const actions = actionsMock.createSetup();
    const emitEvent = jest.fn().mockResolvedValue(undefined);
    const getClient = jest.fn().mockResolvedValue({ emitEvent });

    registerWorkflowsConnectorEventEmitter({
      actions,
      getWorkflowsExtensionsStart: async () => ({ getClient } as never),
      logger: loggingSystemMock.create().get(),
    });

    const emitter = actions.registerConnectorEventEmitter.mock.calls[0][0];
    await emitter.emit({
      eventId: 'inboundWebhook.received',
      payload: { connectorId: 'c1', body: {} },
      spaceId: 'default',
      connectorId: 'c1',
      connectorTypeId: '.inboundWebhook',
    });

    const requestArg = getClient.mock.calls[0][0];
    expect(requestArg.headers.authorization).toBeUndefined();
  });
});
