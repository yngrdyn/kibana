/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AgentBuilderAccessChecker } from './access';
import { createPublicEmbeddableChatAccess } from './create_public_embeddable_chat_access';

const createApplication = (hasShowPrivilege: boolean): ApplicationStart =>
  ({
    capabilities: {
      agentBuilder: { show: hasShowPrivilege },
    },
  } as unknown as ApplicationStart);

describe('createPublicEmbeddableChatAccess', () => {
  it('returns denied access without calling the checker when show capability is missing', async () => {
    const getEmbeddableChatAccess = jest.fn();
    const accessChecker = { getEmbeddableChatAccess } as unknown as AgentBuilderAccessChecker;
    const getAccess = createPublicEmbeddableChatAccess({
      accessChecker,
      application: createApplication(false),
    });

    await expect(getAccess()).resolves.toEqual({
      hasRequiredLicense: false,
      hasLlmConnector: false,
    });

    expect(getEmbeddableChatAccess).not.toHaveBeenCalled();
  });

  it('delegates to accessChecker.getEmbeddableChatAccess when show capability is granted', async () => {
    const getEmbeddableChatAccess = jest.fn().mockResolvedValue({
      hasRequiredLicense: true,
      hasLlmConnector: true,
    });
    const accessChecker = { getEmbeddableChatAccess } as unknown as AgentBuilderAccessChecker;
    const getAccess = createPublicEmbeddableChatAccess({
      accessChecker,
      application: createApplication(true),
    });

    await expect(getAccess()).resolves.toEqual({
      hasRequiredLicense: true,
      hasLlmConnector: true,
    });

    expect(getEmbeddableChatAccess).toHaveBeenCalled();
  });
});
