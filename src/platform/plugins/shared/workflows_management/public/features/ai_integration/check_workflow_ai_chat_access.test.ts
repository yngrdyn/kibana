/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { HttpHandler } from '@kbn/core/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import { checkWorkflowAiChatAccess } from './check_workflow_ai_chat_access';

const createLicensingMock = (hasEnterpriseLicense: boolean): LicensingPluginStart =>
  ({
    license$: new BehaviorSubject({
      hasAtLeast: jest.fn().mockReturnValue(hasEnterpriseLicense),
      isActive: hasEnterpriseLicense,
    }),
  } as unknown as LicensingPluginStart);

const createHttpMock = (connectors: unknown[]): HttpHandler =>
  ({
    get: jest.fn().mockResolvedValue({ connectors }),
  } as unknown as HttpHandler);

describe('checkWorkflowAiChatAccess', () => {
  it('returns false when the user lacks Agent Builder show privilege', async () => {
    const result = await checkWorkflowAiChatAccess({
      http: createHttpMock([{ id: 'openai' }]),
      licensing: createLicensingMock(true),
      hasAgentBuilderShowPrivilege: false,
    });

    expect(result).toBe(false);
  });

  it('returns false when the cluster license is not enterprise', async () => {
    const result = await checkWorkflowAiChatAccess({
      http: createHttpMock([{ id: 'openai' }]),
      licensing: createLicensingMock(false),
      hasAgentBuilderShowPrivilege: true,
    });

    expect(result).toBe(false);
  });

  it('returns false when no inference connectors are configured', async () => {
    const result = await checkWorkflowAiChatAccess({
      http: createHttpMock([]),
      licensing: createLicensingMock(true),
      hasAgentBuilderShowPrivilege: true,
    });

    expect(result).toBe(false);
  });

  it('returns true when privilege, license, and connectors are available', async () => {
    const result = await checkWorkflowAiChatAccess({
      http: createHttpMock([{ id: 'openai' }]),
      licensing: createLicensingMock(true),
      hasAgentBuilderShowPrivilege: true,
    });

    expect(result).toBe(true);
  });

  it('returns false when the connectors request fails', async () => {
    const http = {
      get: jest.fn().mockRejectedValue(new Error('forbidden')),
    } as unknown as HttpHandler;

    const result = await checkWorkflowAiChatAccess({
      http,
      licensing: createLicensingMock(true),
      hasAgentBuilderShowPrivilege: true,
    });

    expect(result).toBe(false);
  });
});
