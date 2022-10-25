/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBasicTableColumn, EuiFlexGroup, EuiFlexItem, EuiInMemoryTable, EuiLoadingContent } from '@elastic/eui';
import { AgentExplorerFieldName } from '@kbn/apm-plugin/common/agent_explorer';
import { getServiceNodeName, SERVICE_NODE_NAME_MISSING } from '@kbn/apm-plugin/common/service_nodes';
import { useProgressiveFetcher } from '@kbn/apm-plugin/public/hooks/use_progressive_fetcher';
import { useTimeRange } from '@kbn/apm-plugin/public/hooks/use_time_range';
import { unit } from '@kbn/apm-plugin/public/utils/style';
import { i18n } from '@kbn/i18n';
import { FETCH_STATUS } from '@kbn/observability-plugin/public';
import moment from 'moment';
import React from 'react';
import { ValuesType } from "utility-types";
import { APIReturnType } from "../../../services/rest/create_call_apm_api";
import { EnvironmentBadge } from '../../shared/environment_badge';
import { ItemsBadge } from '../../shared/item_badge';
import { TruncateWithTooltip } from '../../shared/truncate_with_tooltip';

type AgentExplorerInstance = ValuesType<
  APIReturnType<'GET /internal/apm/services/{serviceName}/agent_instances'>
>;

enum AgentExplorerInstanceFieldName {
  InstanceName = 'serviceNode',
  Environments = 'environments',
  AgentName = 'agentName',
  AgentVersion = 'agentVersion',
  LastReport = 'lastReport',
}

export function getAgentsColumns({
  serviceName,
}: {
  serviceName: string;
}): Array<EuiBasicTableColumn<AgentExplorerInstance>> {
  return [
    {
      field: AgentExplorerInstanceFieldName.InstanceName,
      name: i18n.translate('xpack.apm.agentExplorerTable.serviceNameColumnLabel', {
        defaultMessage: 'Instance',
      }),
      sortable: true,
      render: (_, { serviceNode }) => {
        const { displayedName, tooltip } =
          serviceNode === SERVICE_NODE_NAME_MISSING
            ? {
              displayedName: getServiceNodeName(serviceNode),
              tooltip: i18n.translate(
                'xpack.apm.jvmsTable.explainServiceNodeNameMissing',
                {
                  defaultMessage:
                    'We could not identify which JVMs these metrics belong to. This is likely caused by running a version of APM Server that is older than 7.5. Upgrading to APM Server 7.5 or higher should resolve this issue.',
                }
              ),
            }
            : { displayedName: serviceNode, tooltip: serviceNode };

        return (
          <TruncateWithTooltip
            data-test-subj="apmAgentExplorerListServiceLink"
            text={tooltip}
            content={
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem className="eui-textTruncate">
                  <span className="eui-textTruncate">{displayedName}</span>
                </EuiFlexItem>
              </EuiFlexGroup>
            }
          />
        )
      },
    },
    {
      field: AgentExplorerInstanceFieldName.Environments,
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
      field: AgentExplorerInstanceFieldName.AgentVersion,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.agentVersionColumnLabel',
        { defaultMessage: 'Agent Version' }
      ),
      width: `${unit * 15}px`,
      sortable: true,
      render: (_, { agentVersion }) => (
        <ItemsBadge
          items={agentVersion ? [agentVersion] : []}
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
      field: AgentExplorerInstanceFieldName.LastReport,
      name: i18n.translate(
        'xpack.apm.agentExplorerTable.environmentColumnLabel',
        {
          defaultMessage: 'Last report',
        }
      ),
      width: `${unit * 15}px`,
      sortable: true,
      render: (_, { lastReport }) => (
        <>
          {moment(new Date(`${lastReport}`)).fromNow()}
        </>
      ),
    },
  ];
}

interface Props {
  serviceName: string;
}

export function AgentInstancesDetails({
  serviceName,
}: Props) {

  const { start, end } = useTimeRange({ rangeFrom: 'now-24h', rangeTo: 'now' });

  const { data, status } = useProgressiveFetcher(
    (callApmApi) => {
      return callApmApi(
        'GET /internal/apm/services/{serviceName}/agent_instances',
        {
          params: {
            path: {
              serviceName,
            },
            query: {
              environment: 'ENVIRONMENT_ALL',
              start,
              end,
              kuery: '',
            },
          },
        }
      );
    },
    [start, end, serviceName]
  );

  const loading =
    status === FETCH_STATUS.NOT_INITIATED || status === FETCH_STATUS.LOADING;

  if (
    status === FETCH_STATUS.LOADING ||
    status === FETCH_STATUS.NOT_INITIATED
  ) {
    return (
      <div style={{ width: '50%' }}>
        <EuiLoadingContent data-test-subj="loadingSpinner" />
      </div>
    );
  }

  const agents = (data?.items ?? []);

  return (
    <EuiInMemoryTable
      tableCaption={i18n.translate('xpack.apm.agentExplorer.table.caption', {
        defaultMessage: 'Agent Explorer',
      })}
      items={agents}
      columns={getAgentsColumns({ serviceName })}
      pagination={{
        pageSizeOptions: [25, 50, 100],
      }}
      sorting={{
        sort: {
          field: AgentExplorerFieldName.AgentVersion,
          direction: 'desc'
        }
      }}
      data-test-subj="agentExplorerTable"
      message={
        loading
          ? i18n.translate('xpack.apm.storageExplorer.table.loading', {
              defaultMessage: 'Loading...',
            })
          : i18n.translate('xpack.apm.storageExplorer.table.noResults', {
              defaultMessage: 'No data found',
            })
      }
    />
  );
}
