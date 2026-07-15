/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';

import type { ConnectorEventEmitParams, ConnectorEventEmitter } from '../types';

export async function dispatchConnectorEvents({
  emitters,
  params,
  logger,
}: {
  emitters: ConnectorEventEmitter[];
  params: ConnectorEventEmitParams;
  logger: Logger;
}): Promise<void> {
  if (emitters.length === 0) {
    logger.warn(
      `No connector event emitters registered; dropping event ${params.eventId} for connector ${params.connectorId}`
    );
    return;
  }

  await Promise.all(
    emitters.map(async (emitter) => {
      try {
        await emitter.emit(params);
      } catch (error) {
        logger.warn(
          `Connector event emitter failed for event ${params.eventId} connector ${
            params.connectorId
          }: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}
