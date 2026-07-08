/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import type { StepDefinitionResponseItem } from './get_step_definitions';
import { registerGetStepDefinitionsRoute } from './get_step_definitions';
import { ServerStepRegistry } from '../step_registry';

describe('registerGetStepDefinitionsRoute', () => {
  const router = httpServiceMock.createRouter();
  const logger = loggerMock.create();
  const registry = new ServerStepRegistry();

  beforeEach(() => {
    router.get.mockClear();
  });

  it('registers a GET route at the expected path with internal access and authz disabled', () => {
    registerGetStepDefinitionsRoute(router, registry, logger);

    expect(router.get).toHaveBeenCalledTimes(1);
    const [routeConfig] = router.get.mock.calls[0];
    expect(routeConfig.path).toBe('/internal/workflows_extensions/step_definitions');
    expect(routeConfig.options?.access).toBe('internal');
    expect(routeConfig.security?.authz).toHaveProperty('enabled', false);
    expect(routeConfig.validate).toHaveProperty('query');
  });

  it('returns steps sorted alphabetically with definition hashes', async () => {
    const stepRegistry = new ServerStepRegistry(logger);
    const sharedHandler = async () => ({ output: {} });
    stepRegistry.register({ id: 'z.step', handler: sharedHandler } as any);
    stepRegistry.register({ id: 'a.step', handler: sharedHandler } as any);
    stepRegistry.register({ id: 'm.step', handler: sharedHandler } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    expect(response.ok).toHaveBeenCalledTimes(1);
    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: Array<{ id: string; definitionHash: string }> };

    expect(steps.map((s) => s.id)).toEqual(['a.step', 'm.step', 'z.step']);
    // All share the same handler, so hashes must be identical
    expect(steps[0].definitionHash).toBe(steps[1].definitionHash);
    expect(steps[1].definitionHash).toBe(steps[2].definitionHash);
    // Hashes are non-empty hex strings
    expect(steps[0].definitionHash).toMatch(/^[a-f0-9]+$/);
  });

  it('returns empty steps array when registry is empty', async () => {
    const emptyRegistry = new ServerStepRegistry(logger);
    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, emptyRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    const { body } = response.ok.mock.calls[0][0]!;
    expect((body as { steps: unknown[] }).steps).toEqual([]);
  });

  it('ignores handler implementation when computing the hash', async () => {
    const stepRegistry = new ServerStepRegistry(logger);
    // Same contract (no schemas/metadata), different handler implementations.
    stepRegistry.register({ id: 'a.step', handler: async () => ({ output: 'a' }) } as any);
    stepRegistry.register({ id: 'b.step', handler: async () => ({ output: 'b' }) } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: Array<{ id: string; definitionHash: string }> };
    expect(steps[0].definitionHash).toBe(steps[1].definitionHash);
  });

  it('produces different hashes when only the schema differs', async () => {
    const sharedHandler = async () => ({ output: {} });
    const stepRegistry = new ServerStepRegistry(logger);
    stepRegistry.register({
      id: 'a.step',
      handler: sharedHandler,
      inputSchema: z.object({ message: z.string() }),
    } as any);
    stepRegistry.register({
      id: 'b.step',
      handler: sharedHandler,
      inputSchema: z.object({ count: z.number() }),
    } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: Array<{ id: string; definitionHash: string }> };
    expect(steps[0].definitionHash).not.toBe(steps[1].definitionHash);
  });

  it('logs an error and returns a fallback hash when hashing fails', async () => {
    const stepRegistry = new ServerStepRegistry(logger);
    // z.date() is unrepresentable in JSON Schema and makes z.toJSONSchema throw.
    stepRegistry.register({
      id: 'a.step',
      handler: async () => ({ output: 'a' }),
      inputSchema: z.date(),
    } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: Array<{ id: string; definitionHash: string }> };
    expect(steps[0].definitionHash).toBe('definition-hashing-error');
    expect(logger.error).toHaveBeenCalled();
  });

  it('includes doc metadata when includeDocs=true', async () => {
    const stepRegistry = new ServerStepRegistry(logger);
    stepRegistry.register({
      id: 'ai.prompt',
      category: StepCategory.Ai,
      label: 'AI Prompt',
      description: 'Send a prompt to an AI connector',
      documentation: {
        details: 'Detailed docs',
        examples: ['## Example\n```yaml\n- type: ai.prompt\n```'],
      },
      inputSchema: z.object({ prompt: z.string() }),
      outputSchema: z.object({ response: z.string() }),
      handler: async () => ({ output: { response: 'ok' } }),
    } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler(
      {} as any,
      httpServerMock.createKibanaRequest({ query: { includeDocs: true } }),
      response
    );

    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: StepDefinitionResponseItem[] };
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 'ai.prompt',
      stepCategory: StepCategory.Ai,
      label: 'AI Prompt',
      description: 'Send a prompt to an AI connector',
      documentation: { details: 'Detailed docs' },
    });
    expect(steps[0].input).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'prompt', type: 'string' })])
    );
    expect(steps[0].output).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'response', type: 'string' })])
    );
  });

  it('omits doc metadata when includeDocs is not set', async () => {
    const stepRegistry = new ServerStepRegistry(logger);
    stepRegistry.register({
      id: 'ai.prompt',
      category: StepCategory.Ai,
      label: 'AI Prompt',
      handler: async () => ({ output: {} }),
    } as any);

    const testRouter = httpServiceMock.createRouter();
    registerGetStepDefinitionsRoute(testRouter, stepRegistry, logger);

    const [, handler] = testRouter.get.mock.calls[0];
    const response = httpServerMock.createResponseFactory();
    await handler({} as any, httpServerMock.createKibanaRequest(), response);

    const { body } = response.ok.mock.calls[0][0]!;
    const { steps } = body as { steps: Array<{ id: string; definitionHash: string }> };
    expect(steps[0]).toEqual({
      id: 'ai.prompt',
      definitionHash: expect.any(String),
    });
  });
});
