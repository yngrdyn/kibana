/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AgentName,
  isElasticAgentName,
} from '../../../typings/es_schemas/ui/fields/agent';
import { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { RandomSampler } from '../../lib/helpers/get_random_sampler';
import {
  ElasticAgentLatestVersion,
  fetchAgentsLatestVersion,
  OtelAgentLatestVersion,
} from './fetch_agents_latest_version';
import { getAgentsItems } from './get_agents_items';
import { getAgentDocsPageUrl } from './get_agent_url_repository';

export async function getAgents({
  environment,
  serviceName,
  agentLanguage,
  kuery,
  apmEventClient,
  start,
  end,
  randomSampler,
}: {
  environment: string;
  serviceName?: string;
  agentLanguage?: string;
  kuery: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  randomSampler: RandomSampler;
}) {
  const [agents, latestVersions] = await Promise.all([
    getAgentsItems({
      environment,
      serviceName,
      agentLanguage,
      kuery,
      apmEventClient,
      start,
      end,
      randomSampler,
    }),
    fetchAgentsLatestVersion(),
  ]);

  return {
    items: agents.map((agent) => {
      const latestVersion = isElasticAgentName(agent.agentName)
        ? (
            latestVersions[
              agent.agentName as AgentName
            ] as ElasticAgentLatestVersion
          )?.latest_version
        : (
            latestVersions[
              agent.agentName as AgentName
            ] as OtelAgentLatestVersion
          )?.sdk_latest_version;

      return {
        ...agent,
        agentDocsPageUrl: getAgentDocsPageUrl(agent.agentName as AgentName),
        latestVersion,
      };
    }),
  };
}
