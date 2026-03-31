/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';

const MAX_VISITED_IDS_IN_HEADER = 128;

/**
 * Context attached to the request when a workflow runs, so that when code
 * in that workflow emits an event (e.g. via emitEvent), we can infer the
 * event-chain depth and enforce a cap to prevent infinite loops.
 * Depth is incremented for every step in the chain (any workflow); the trigger
 * event handler caps scheduling when depth exceeds the configured max.
 *
 * `depth` may be `-1` when the execution has no persisted chain depth yet.
 */
export interface EventChainContext {
  depth: number;
  sourceWorkflowId?: string;
  /** Workflow ids that already ran earlier in this event chain (cycle guard). */
  visitedWorkflowIds?: string[];
}

/**
 * HTTP header name used when a workflow step (e.g. kibana.request) makes an outbound request
 * to Kibana. The execution engine sets this to the current event-chain depth so the server
 * can restore context on the incoming request and enforce the event-chain depth cap.
 */
export const EVENT_CHAIN_DEPTH_HEADER = 'x-kibana-event-chain-depth';

/**
 * HTTP header name for the workflow id associated with the current chain hop. Set on outbound
 * requests so the server can restore `sourceWorkflowId` on the incoming request (logging and attribution).
 */
export const EVENT_CHAIN_SOURCE_WORKFLOW_HEADER = 'x-kibana-event-chain-source-workflow';

/**
 * Base64url JSON array of visited workflow ids (bounded length) for HTTP emit recovery.
 */
export const EVENT_CHAIN_VISITED_WORKFLOW_IDS_HEADER = 'x-kibana-event-chain-visited-workflows';

/**
 * Workflow execution id of the run that issued an outbound kibana.request so emit routes can
 * load chain state from the persisted execution when headers are incomplete.
 */
export const EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER = 'x-kibana-workflow-execution-id';

/**
 * Symbol used to attach event-chain context to a KibanaRequest.
 */
export const WORKFLOW_EVENT_CHAIN_CONTEXT = Symbol.for('kibana.workflows.eventChainContext');

interface RequestWithEventChainContext extends KibanaRequest {
  [key: symbol]: EventChainContext | undefined;
}

function getStoredContext(request: KibanaRequest): EventChainContext | undefined {
  return (request as RequestWithEventChainContext)[WORKFLOW_EVENT_CHAIN_CONTEXT];
}

function setStoredContext(request: KibanaRequest, context: EventChainContext): void {
  (request as RequestWithEventChainContext)[WORKFLOW_EVENT_CHAIN_CONTEXT] = context;
}

/** Normalize header value (string or string[]) to a single trimmed string, or undefined if missing/empty. */
function toSingleHeaderString(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === 'string' ? raw : raw[0];
  if (value == null || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function getHeaderValue(headers: KibanaRequest['headers'], headerName: string): string | undefined {
  if (headers == null || typeof headers !== 'object') return undefined;

  const maybeGet = (headers as { get?: (name: string) => string | null }).get;
  if (typeof maybeGet === 'function') {
    const value = maybeGet.call(headers, headerName);
    return toSingleHeaderString(value ?? undefined);
  }

  const lower = headerName.toLowerCase();
  const record = headers as Record<string, string | string[] | undefined>;
  const raw =
    record[headerName] ??
    record[lower] ??
    Object.entries(record).find(([k]) => k.toLowerCase() === lower)?.[1];
  return toSingleHeaderString(raw);
}

function parseVisitedWorkflowIdsFromHeader(encoded: string): string[] | undefined {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || item.trim() === '') {
        continue;
      }
      out.push(item.trim());
      if (out.length >= MAX_VISITED_IDS_IN_HEADER) {
        break;
      }
    }
    return out;
  } catch {
    return undefined;
  }
}

function encodeVisitedWorkflowIdsForHeader(ids: string[]): string {
  const capped = ids.slice(0, MAX_VISITED_IDS_IN_HEADER);
  return Buffer.from(JSON.stringify(capped), 'utf8').toString('base64url');
}

function parseDepthFromHeaders(headers: KibanaRequest['headers']): number | undefined {
  const value = getHeaderValue(headers, EVENT_CHAIN_DEPTH_HEADER);
  if (value === undefined) {
    return undefined;
  }
  const depth = parseInt(value, 10);
  if (Number.isNaN(depth)) {
    return undefined;
  }
  if (depth === -1) {
    return -1;
  }
  return depth >= 0 ? depth : undefined;
}

function parseSourceWorkflowIdFromHeaders(headers: KibanaRequest['headers']): string | undefined {
  return getHeaderValue(headers, EVENT_CHAIN_SOURCE_WORKFLOW_HEADER);
}

/** Workflow execution id for chain context recovery on HTTP emit paths. */
export function getEmitterWorkflowExecutionIdFromRequest(request: KibanaRequest): string | undefined {
  return getHeaderValue(request.headers, EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER);
}

/**
 * Returns the event-chain context from the request if it was set by a workflow run.
 * Used inside emitEvent to infer depth when the emitter is in a workflow-triggered path.
 * Reads from: (1) the request's symbol (execution-engine fakeRequest path), or
 * (2) the x-kibana-event-chain-* headers (HTTP path).
 */
export function getEventChainContext(request: KibanaRequest): EventChainContext | undefined {
  const stored = getStoredContext(request);
  if (stored !== undefined) {
    return stored;
  }
  const depth = parseDepthFromHeaders(request.headers);
  if (depth === undefined) {
    return undefined;
  }
  const sourceWorkflowId = parseSourceWorkflowIdFromHeaders(request.headers);
  const visitedEncoded = getHeaderValue(request.headers, EVENT_CHAIN_VISITED_WORKFLOW_IDS_HEADER);
  const visitedFromHeader =
    visitedEncoded !== undefined ? parseVisitedWorkflowIdsFromHeader(visitedEncoded) : undefined;
  return {
    depth,
    ...(sourceWorkflowId !== undefined && { sourceWorkflowId }),
    ...(visitedFromHeader !== undefined &&
      visitedFromHeader.length > 0 && { visitedWorkflowIds: visitedFromHeader }),
  };
}

/**
 * Sets the event-chain context on the request. Called by the execution engine
 * at the start of a workflow run so that any emitEvent call using this request
 * (e.g. in-process with the fakeRequest) will have the correct depth and sourceWorkflowId.
 */
export function setWorkflowEventChainContext(
  request: KibanaRequest,
  context: EventChainContext
): void {
  setStoredContext(request, context);
}

/**
 * Returns headers that should be added to outbound HTTP requests to Kibana
 * when the request is made from a workflow step (e.g. kibana.request).
 * Enables the server to restore event-chain context and enforce depth limits.
 *
 * @param emitterWorkflowExecutionId - Current workflow run id for routes that load chain state from ES.
 */
export function getOutboundEventChainHeaders(
  request: KibanaRequest,
  emitterWorkflowExecutionId?: string
): Record<string, string> {
  const ctx = getEventChainContext(request);
  const headers: Record<string, string> = {};
  if (ctx) {
    headers[EVENT_CHAIN_DEPTH_HEADER] = String(ctx.depth);
    headers[EVENT_CHAIN_SOURCE_WORKFLOW_HEADER] = ctx.sourceWorkflowId ?? '';
    if (ctx.visitedWorkflowIds !== undefined && ctx.visitedWorkflowIds.length > 0) {
      headers[EVENT_CHAIN_VISITED_WORKFLOW_IDS_HEADER] = encodeVisitedWorkflowIdsForHeader(
        ctx.visitedWorkflowIds
      );
    }
  }
  if (emitterWorkflowExecutionId !== undefined && emitterWorkflowExecutionId !== '') {
    headers[EVENT_CHAIN_EMITTER_EXECUTION_ID_HEADER] = emitterWorkflowExecutionId;
  }
  return headers;
}
