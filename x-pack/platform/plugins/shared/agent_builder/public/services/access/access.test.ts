/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import type { InferencePublicStart } from '@kbn/inference-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import { AgentBuilderAccessChecker, resolveEmbeddableChatAccess } from './access';

const createAccessChecker = ({
  hasEnterpriseLicense,
  connectorCount,
  connectorsReject,
}: {
  hasEnterpriseLicense: boolean;
  connectorCount: number;
  connectorsReject?: Error;
}) => {
  const licensing = {
    license$: new BehaviorSubject({
      hasAtLeast: jest.fn().mockReturnValue(hasEnterpriseLicense),
      isActive: hasEnterpriseLicense,
    }),
  } as unknown as LicensingPluginStart;

  const inference = {
    getConnectors: connectorsReject
      ? jest.fn().mockRejectedValue(connectorsReject)
      : jest
          .fn()
          .mockResolvedValue(
            Array.from({ length: connectorCount }, (_, index) => ({ id: `c-${index}` }))
          ),
  } as unknown as InferencePublicStart;

  return new AgentBuilderAccessChecker({ licensing, inference });
};

describe('resolveEmbeddableChatAccess', () => {
  it('returns denied access shape when the user lacks show privilege', async () => {
    const accessChecker = createAccessChecker({ hasEnterpriseLicense: true, connectorCount: 1 });

    await expect(
      resolveEmbeddableChatAccess({ accessChecker, hasShowPrivilege: false })
    ).resolves.toEqual({
      hasShowPrivilege: false,
      hasRequiredLicense: false,
      hasLlmConnector: false,
    });
  });

  it('returns hasRequiredLicense false when the cluster license is not enterprise', async () => {
    const accessChecker = createAccessChecker({ hasEnterpriseLicense: false, connectorCount: 1 });

    await expect(
      resolveEmbeddableChatAccess({ accessChecker, hasShowPrivilege: true })
    ).resolves.toEqual({
      hasShowPrivilege: true,
      hasRequiredLicense: false,
      hasLlmConnector: true,
    });
  });

  it('returns hasLlmConnector false when no inference connectors are configured', async () => {
    const accessChecker = createAccessChecker({ hasEnterpriseLicense: true, connectorCount: 0 });

    await expect(
      resolveEmbeddableChatAccess({ accessChecker, hasShowPrivilege: true })
    ).resolves.toEqual({
      hasShowPrivilege: true,
      hasRequiredLicense: true,
      hasLlmConnector: false,
    });
  });

  it('returns all three signals true when privilege, license, and connectors are available', async () => {
    const accessChecker = createAccessChecker({ hasEnterpriseLicense: true, connectorCount: 1 });

    await expect(
      resolveEmbeddableChatAccess({ accessChecker, hasShowPrivilege: true })
    ).resolves.toEqual({
      hasShowPrivilege: true,
      hasRequiredLicense: true,
      hasLlmConnector: true,
    });
  });

  it('returns denied access shape when connector lookup fails', async () => {
    const accessChecker = createAccessChecker({
      hasEnterpriseLicense: true,
      connectorCount: 0,
      connectorsReject: new Error('forbidden'),
    });

    await expect(
      resolveEmbeddableChatAccess({ accessChecker, hasShowPrivilege: true })
    ).resolves.toEqual({
      hasShowPrivilege: true,
      hasRequiredLicense: false,
      hasLlmConnector: false,
    });
  });
});
