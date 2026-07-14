/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';

/**
 * Bridges the request-scoped Actions call to a user-created connector executor.
 * Actions only exposes `request` to system connector executors, so the inbound
 * route keeps the synthetic request in memory for the duration of the
 * synchronous connector execution.
 */
export class InboundWebhookRequestStore {
  private readonly requests = new Map<string, KibanaRequest>();

  public set(eventId: string, request: KibanaRequest): void {
    this.requests.set(eventId, request);
  }

  public take(eventId: string): KibanaRequest | undefined {
    const request = this.requests.get(eventId);
    this.requests.delete(eventId);
    return request;
  }

  public delete(eventId: string): void {
    this.requests.delete(eventId);
  }
}
