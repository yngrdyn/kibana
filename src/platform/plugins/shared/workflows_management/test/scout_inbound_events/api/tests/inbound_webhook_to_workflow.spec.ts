/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildInboundEventsUrl, INTERNAL_BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
import { INBOUND_WEBHOOK_CONNECTOR_TYPE_ID } from '@kbn/connector-specs';
import type { KbnClient } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { waitForConditionOrThrow } from '../../../scout/common/utils/wait_for_condition';
import type { WorkflowsApiService } from '../fixtures';
import { spaceTest } from '../fixtures';
import { INBOUND_EVENTS_API_VERSION, inboundWorkflowYaml } from '../fixtures/constants';

const rotateInboundToken = async (
  kbnClient: KbnClient,
  spaceId: string,
  connectorId: string
): Promise<string> => {
  const response = await kbnClient.request<{ ingest_token: string }>({
    method: 'POST',
    path: `/s/${spaceId}${INTERNAL_BASE_ACTION_API_PATH}/connector/${connectorId}/_rotate_event_token`,
    headers: { 'x-elastic-internal-origin': 'kibana' },
  });
  const token = response.data.ingest_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('rotate did not return an ingest token');
  }
  return token;
};

spaceTest.describe('Inbound webhook to workflow', { tag: tags.stateful.classic }, () => {
  let workflowsApi: WorkflowsApiService;
  const connectorIds: string[] = [];

  spaceTest.setTimeout(180_000);

  spaceTest.beforeAll(async ({ apiServices }) => {
    workflowsApi = apiServices.workflowsApi;
  });

  spaceTest.afterEach(async ({ scoutSpace, apiServices }) => {
    await workflowsApi.deleteAll();
    await Promise.all(
      connectorIds.splice(0).map((id) => apiServices.alerting.connectors.delete(id, scoutSpace.id))
    );
  });

  spaceTest(
    'create connector → rotate token → POST hub → matching workflow executes',
    async ({ apiServices, apiClient, kbnClient, scoutSpace }) => {
      const connector = await apiServices.alerting.connectors.create(
        {
          name: 'scout-inbound-e2e',
          connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
          config: {},
          secrets: { authType: 'none' },
        },
        scoutSpace.id
      );
      connectorIds.push(connector.id);

      const ingestToken = await rotateInboundToken(kbnClient, scoutSpace.id, connector.id);

      const workflow = await workflowsApi.create(
        inboundWorkflowYaml(connector.id, 'Scout inbound webhook E2E')
      );
      expect(workflow.valid).toBe(true);

      const hubPath = buildInboundEventsUrl({
        spaceId: scoutSpace.id,
        connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
        connectorId: connector.id,
      });
      const hubResponse = await apiClient.post(hubPath, {
        headers: {
          'elastic-api-version': INBOUND_EVENTS_API_VERSION,
          Authorization: `Bearer ${ingestToken}`,
          'kbn-xsrf': 'kibana',
        },
        body: { orderId: 'ord-42' },
      });
      expect(hubResponse.statusCode).toBe(202);
      expect(hubResponse.body).toStrictEqual({ ok: true });

      const { results } = await waitForConditionOrThrow({
        action: () => workflowsApi.getExecutions(workflow.id),
        condition: ({ total }) => total >= 1,
        interval: 1_000,
        timeout: 60_000,
        errorMessage: ({ total }) => `Expected >= 1 execution, got ${total}`,
      });

      const execution = results[0];
      if (execution == null) {
        throw new Error('matching workflow produced no execution');
      }
      await workflowsApi.waitForTermination({
        workflowExecutionId: execution.id,
        timeout: 60_000,
      });
    }
  );

  spaceTest(
    'does not execute a workflow bound to a different connector-id',
    async ({ apiServices, apiClient, kbnClient, scoutSpace }) => {
      const connector = await apiServices.alerting.connectors.create(
        {
          name: 'scout-inbound-mismatch',
          connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
          config: {},
          secrets: { authType: 'none' },
        },
        scoutSpace.id
      );
      connectorIds.push(connector.id);

      const ingestToken = await rotateInboundToken(kbnClient, scoutSpace.id, connector.id);

      const otherConnector = await apiServices.alerting.connectors.create(
        {
          name: 'scout-inbound-other',
          connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
          config: {},
          secrets: { authType: 'none' },
        },
        scoutSpace.id
      );
      connectorIds.push(otherConnector.id);

      const matching = await workflowsApi.create(
        inboundWorkflowYaml(connector.id, 'Scout inbound matching')
      );
      const other = await workflowsApi.create(
        inboundWorkflowYaml(otherConnector.id, 'Scout inbound mismatch')
      );
      expect(matching.valid).toBe(true);
      expect(other.valid).toBe(true);

      const hubPath = buildInboundEventsUrl({
        spaceId: scoutSpace.id,
        connectorTypeId: INBOUND_WEBHOOK_CONNECTOR_TYPE_ID,
        connectorId: connector.id,
      });
      const hubResponse = await apiClient.post(hubPath, {
        headers: {
          'elastic-api-version': INBOUND_EVENTS_API_VERSION,
          Authorization: `Bearer ${ingestToken}`,
          'kbn-xsrf': 'kibana',
        },
        body: { orderId: 'ord-99' },
      });
      expect(hubResponse.statusCode).toBe(202);

      await waitForConditionOrThrow({
        action: () => workflowsApi.getExecutions(matching.id),
        condition: ({ total }) => total >= 1,
        interval: 1_000,
        timeout: 60_000,
        errorMessage: ({ total }) => `Expected matching workflow to run, got ${total} executions`,
      });

      const otherExecutions = await workflowsApi.getExecutions(other.id);
      expect(otherExecutions.total).toBe(0);
    }
  );
});
