/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiLink } from '@elastic/eui';
import {
  EuiBasicTableColumn, EuiInMemoryTable
} from '@elastic/eui';
import { AgentExplorerFieldName } from '@kbn/apm-plugin/common/agent_explorer';
import { AgentName } from '@kbn/apm-plugin/typings/es_schemas/ui/fields/agent';
import { i18n } from '@kbn/i18n';
import { euiStyled } from '@kbn/kibana-react-plugin/common';
import { TypeOf } from '@kbn/typed-react-router-config';
import React, { useEffect, useMemo, useState } from 'react';
import { ValuesType } from "utility-types";
import { NOT_AVAILABLE_LABEL } from '../../../../../common/i18n';
import { useApmParams } from '../../../../hooks/use_apm_params';
import { APIReturnType } from "../../../../services/rest/create_call_apm_api";
import { unit } from '../../../../utils/style';
import { ApmRoutes } from '../../../routing/apm_route_config';
import { EnvironmentBadge } from '../../../shared/environment_badge';
import { ItemsBadge } from '../../../shared/item_badge';
import { TruncateWithTooltip } from '../../../shared/truncate_with_tooltip';
import { AgentExplorerDocsLink } from '../../agent_explorer_docs_link';
import { truncate } from '../../../../utils/style';
import { EuiFlexGroup } from '@elastic/eui';
import { EuiFlexItem } from '@elastic/eui';
import { AgentInstances } from '../agent_instances';
import { AgentIcon } from '../../../shared/agent_icon';

const StyledLink = euiStyled(EuiLink)`${truncate('100%')};`;

export type AgentExplorerItem = ValuesType<
  APIReturnType<'GET /internal/apm/agent_explorer'>['items']
>;

function formatString(value?: string | null) {
  return value || NOT_AVAILABLE_LABEL;
}

export function getAgentsColumns({
  query,
  onAgentSelected,
}: {
  query: TypeOf<ApmRoutes, '/agent-explorer'>['query'];
  onAgentSelected: (agent: AgentExplorerItem) => void;
}): Array<EuiBasicTableColumn<AgentExplorerItem>> {
  return [
    {
      field: AgentExplorerFieldName.ServiceName,
      name: i18n.translate('xpack.apm.agentExplorerTable.serviceNameColumnLabel', {
        defaultMessage: 'Service Name',
      }),
      sortable: true,
      render: (_, agent) => (
        <TruncateWithTooltip
          data-test-subj="apmAgentExplorerListServiceLink"
          text={formatString(agent.serviceName)}
          content={
            <StyledLink
            data-test-subj={`serviceLink_${agent.serviceName}`}
            onClick={() => onAgentSelected(agent)}
          >
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <AgentIcon agentName={agent.agentName} />
              </EuiFlexItem>
              <EuiFlexItem className="eui-textTruncate">
                <span className="eui-textTruncate">{agent.serviceName}</span>
              </EuiFlexItem>
            </EuiFlexGroup>
          </StyledLink>
          }
        />
      ),
    },
    {
      field: AgentExplorerFieldName.Environments,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.environmentColumnLabel',
        {
          defaultMessage: 'Environment',
        }
      ),
      width: `${unit * 15}px`,
      sortable: true,
      render: (_, { environments }) => (
        <EnvironmentBadge environments={environments ?? []} />
      ),
    },
    {
      field: AgentExplorerFieldName.AgentName,
      width: `${unit * 10}px`,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.agentNameColumnLabel',
        { defaultMessage: 'Agent Name' }
      ),
      sortable: true,
      render: (_, agent) => (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem className="eui-textTruncate">
            <span className="eui-textTruncate">{agent.agentName}</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: AgentExplorerFieldName.AgentVersion,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.agentVersionColumnLabel',
        { defaultMessage: 'Agent Version' }
      ),
      width: `${unit * 10}px`,
      render: (_, { agentVersion }) => (
        <ItemsBadge
          items={agentVersion ?? []}
          multipleItemsMessage={i18n.translate(
            'xpack.apm.agentExplorerTable.agentVersionColumnLabel.multipleVersions',
            { 
              values: { versionsCount: agentVersion.length },
              defaultMessage: '{versionsCount, plural, one {1 version} other {# versions}}',
            }
          )}
        />
      ),
    },
    {
      field: AgentExplorerFieldName.AgentLastVersion,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.latestVersionColumnLabel',
        { defaultMessage: 'Latest Version' }
      ),
      width: `${unit * 10}px`,
      render: (_, { agentLastVersion }) => (
        formatString(agentLastVersion)
      ),
    },
    {
      field: AgentExplorerFieldName.AgentRepoUrl,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.agentDocsColumnLabel',
        { defaultMessage: 'Agent Docs' }
      ),
      width: `${unit * 10}px`,
      render: (_, { agentName, agentRepoUrl }) => (
        <TruncateWithTooltip
          data-test-subj="apmAgentExplorerListDocsLink"
          text={formatString(`${agentName} agent docs`)}
          content={
            <AgentExplorerDocsLink
              agentName={agentName as AgentName}
              repositoryUrl={agentRepoUrl}
            />
          }
        />
      ),
    }
  ];
}

interface Props {
  items: AgentExplorerItem[];
  noItemsMessage?: React.ReactNode;
  isLoading: boolean;
  isFailure?: boolean;
}

export function AgentList({
  items,
  noItemsMessage,
  isLoading,
  isFailure,
}: Props) {
  const [selectedAgent, setSelectedAgent] = useState<AgentExplorerItem>();
  const [showFlyout, setShowFlyout] = useState(false);

  useEffect(() => {
    setShowFlyout(!!selectedAgent);
  }, [selectedAgent]);

  const onAgentSelected = (serviceName: string) => {
    setSelectedAgent(serviceName);
  }

  const onCloseFlyout = () => {
    setShowFlyout(false);
    setSelectedAgent(undefined);
  };

  const {
    // removes pagination and sort instructions from the query so it won't be passed down to next route
    query: {
      page,
      pageSize,
      sortDirection: direction,
      sortField: field,
      ...query
    },
  } = useApmParams('/agent-explorer');

  const agentColumns = useMemo(
    () =>
      getAgentsColumns({ query, onAgentSelected }),
    [ query ]
  );

  return (
    <>
      {showFlyout && (
        <AgentInstances
          agent={selectedAgent}
          onClose={onCloseFlyout}
        />
      )}
      <EuiInMemoryTable
        tableCaption={i18n.translate('xpack.apm.agentExplorer.table.caption', {
          defaultMessage: 'Agent Explorer',
        })}
        items={items}
        columns={agentColumns}
        pagination={{
          pageSizeOptions: [25, 50, 100],
        }}
        sorting={{ sort: {
            field: AgentExplorerFieldName.Environments,
            direction: 'desc'
          }
        }}
        loading={isLoading}
        data-test-subj="agentExplorerTable"
        message={
          isLoading
            ? i18n.translate('xpack.apm.agentExplorer.table.loading', {
                defaultMessage: 'Loading...',
              })
            : noItemsMessage
        }
      />
    </>
  );
}
