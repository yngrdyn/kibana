/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';
import type { z } from '@kbn/zod/v4';

export type ConnectorEventStability = 'stable' | 'beta' | 'tech_preview';

/**
 * Declarative event definition on a ConnectorSpec.
 * Workflows trigger `type` equals {@link ConnectorEventDefinition.eventId}.
 *
 */
export interface ConnectorEventDefinition {
  /** MUST equal `{connectorTypeId sans dot}.{eventKey}` */
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly eventSchema: z.ZodObject;
  readonly stability?: ConnectorEventStability;
}

export interface InboundEventContext {
  readonly connectorId: string;
  readonly connectorTypeId: string;
  readonly spaceId: string;
  readonly config: Record<string, unknown>;
  readonly secrets: Record<string, unknown>;
  readonly rawBody: unknown;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly log: Logger;
}

export interface InboundEventHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

export interface InboundEventPayload {
  readonly eventId: string;
  readonly correlationKey: string;
  readonly payload: Record<string, unknown>;
}

export interface HandleEventsResult {
  /** Control-plane responses (e.g. Slack URL verification) — skip emitEvent */
  readonly httpResponse?: InboundEventHttpResponse;
  /** Data-plane events for Workflows emitEvent */
  readonly events?: InboundEventPayload[];
}

export interface ConnectorSpecEvents {
  readonly definitions: Record<string, ConnectorEventDefinition>;
  handleEvents(ctx: InboundEventContext): Promise<HandleEventsResult>;
}

/**
 * Resolved connector event after registration — consumed by Workflows surface resolver.
 */
export interface RegisteredConnectorEvent extends ConnectorEventDefinition {
  readonly connectorTypeId: string;
  readonly eventKey: string;
}
