/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveConnectorEventTriggerDefinition } from '@kbn/workflows';
import { resolveTriggerDefinition } from './resolve_trigger_definition';

jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    resolveConnectorEventTriggerDefinition: jest.fn(),
  };
});

const mockResolveConnectorEventTriggerDefinition =
  resolveConnectorEventTriggerDefinition as jest.MockedFunction<
    typeof resolveConnectorEventTriggerDefinition
  >;

describe('resolveTriggerDefinition', () => {
  beforeEach(() => {
    mockResolveConnectorEventTriggerDefinition.mockReset();
  });

  it('prefers a trigger registered in workflows_extensions', () => {
    const registered = { id: 'entityStore.riskScoreChanged' };
    const workflowsExtensions = {
      getTriggerDefinition: jest.fn().mockReturnValue(registered),
    } as any;

    expect(resolveTriggerDefinition('entityStore.riskScoreChanged', workflowsExtensions)).toBe(
      registered
    );
    expect(mockResolveConnectorEventTriggerDefinition).not.toHaveBeenCalled();
  });

  it('falls back to connector spec events when the trigger is not registered', () => {
    const fromSpec = { id: 'inboundWebhook.received' };
    mockResolveConnectorEventTriggerDefinition.mockReturnValue(fromSpec as any);
    const workflowsExtensions = {
      getTriggerDefinition: jest.fn().mockReturnValue(undefined),
    } as any;

    expect(resolveTriggerDefinition('inboundWebhook.received', workflowsExtensions)).toBe(fromSpec);
    expect(mockResolveConnectorEventTriggerDefinition).toHaveBeenCalledWith(
      'inboundWebhook.received'
    );
  });
});
