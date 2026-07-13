/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import type { HttpHandler } from '@kbn/core/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';

const INFERENCE_CONNECTORS_PATH = '/internal/inference/connectors';

interface InferenceConnectorsResponse {
  connectors: unknown[];
}

interface CheckWorkflowAiChatAccessParams {
  http: HttpHandler;
  licensing: LicensingPluginStart;
  hasAgentBuilderShowPrivilege: boolean;
}

/**
 * Mirrors the Agent Builder embeddable access boundary checks that workflows
 * needs before auto-opening the NL2Workflow chat sidebar.
 */
export const checkWorkflowAiChatAccess = async ({
  http,
  licensing,
  hasAgentBuilderShowPrivilege,
}: CheckWorkflowAiChatAccessParams): Promise<boolean> => {
  if (!hasAgentBuilderShowPrivilege) {
    return false;
  }

  try {
    const license = await firstValueFrom(licensing.license$);
    if (!license.hasAtLeast('enterprise') || !license.isActive) {
      return false;
    }

    const { connectors } = await http.get<InferenceConnectorsResponse>(INFERENCE_CONNECTORS_PATH);
    return connectors.length > 0;
  } catch {
    return false;
  }
};
