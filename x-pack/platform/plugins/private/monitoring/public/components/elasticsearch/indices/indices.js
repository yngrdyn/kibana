/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { capitalize } from 'lodash';
import { css } from '@emotion/react';
import {
  EuiLink,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSwitch,
  EuiSpacer,
  EuiScreenReaderOnly,
} from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { AlertsStatus } from '../../../alerts/status';
import { ClusterStatus } from '../cluster_status';
import { ElasticsearchStatusIcon } from '../status_icon';
import { EuiMonitoringTable } from '../../table';
import { LARGE_FLOAT, LARGE_BYTES, LARGE_ABBREVIATED } from '../../../../common/formatting';
import { formatMetric } from '../../../lib/format_number';
import { getSafeForExternalLink } from '../../../lib/get_safe_for_external_link';

const statusStyle = css`
  display: flex;
  align-items: center;
`;

const getColumns = (alerts) => {
  return [
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.nameTitle', {
        defaultMessage: 'Name',
      }),
      field: 'name',
      width: '350px',
      sortable: true,
      render: (value) => (
        <div data-test-subj="name">
          <EuiLink
            href={getSafeForExternalLink(`#/elasticsearch/indices/${value}`)}
            data-test-subj={`indexLink-${value}`}
          >
            {value}
          </EuiLink>
        </div>
      ),
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.alertsColumnTitle', {
        defaultMessage: 'Alerts',
      }),
      field: 'alerts',
      sortable: true,
      render: (_field, index) => {
        return (
          <AlertsStatus
            showBadge={true}
            alerts={alerts}
            stateFilter={(state) => state.meta.shardIndex === index.name}
          />
        );
      },
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.statusTitle', {
        defaultMessage: 'Status',
      }),
      field: 'status',
      sortable: true,
      render: (value) => (
        <div css={statusStyle} title={`Index status: ${value}`}>
          <ElasticsearchStatusIcon status={value} />
          &nbsp;
          {capitalize(value)}
        </div>
      ),
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.documentCountTitle', {
        defaultMessage: 'Document Count',
      }),
      field: 'doc_count',
      sortable: true,
      render: (value) => (
        <div data-test-subj="documentCount">{formatMetric(value, LARGE_ABBREVIATED)}</div>
      ),
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.dataTitle', {
        defaultMessage: 'Data',
      }),
      field: 'data_size',
      sortable: true,
      render: (value) => <div data-test-subj="dataSize">{formatMetric(value, LARGE_BYTES)}</div>,
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.indexRateTitle', {
        defaultMessage: 'Index Rate',
      }),
      field: 'index_rate',
      sortable: true,
      render: (value) => (
        <div data-test-subj="indexRate">{formatMetric(value, LARGE_FLOAT, '/s')}</div>
      ),
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.searchRateTitle', {
        defaultMessage: 'Search Rate',
      }),
      field: 'search_rate',
      sortable: true,
      render: (value) => (
        <div data-test-subj="searchRate">{formatMetric(value, LARGE_FLOAT, '/s')}</div>
      ),
    },
    {
      name: i18n.translate('xpack.monitoring.elasticsearch.indices.unassignedShardsTitle', {
        defaultMessage: 'Unassigned Shards',
      }),
      field: 'unassigned_shards',
      sortable: true,
      render: (value) => <div data-test-subj="unassignedShards">{formatMetric(value, '0')}</div>,
    },
  ];
};

const getNoDataMessage = () => {
  return (
    <div>
      <p>
        <FormattedMessage
          id="xpack.monitoring.elasticsearch.indices.noIndicesMatchYourSelectionDescription"
          defaultMessage="There are no indices that match your selections. Try changing the time range selection."
        />
      </p>
      <p>
        <FormattedMessage
          id="xpack.monitoring.elasticsearch.indices.howToShowSystemIndicesDescription"
          defaultMessage="If you are looking for system indices (e.g., .kibana), try checking &lsquo;Filter for system indices&rsquo;."
        />
      </p>
    </div>
  );
};

export const ElasticsearchIndices = ({
  clusterStatus,
  indices,
  sorting,
  pagination,
  onTableChange,
  toggleShowSystemIndices,
  showSystemIndices,
  alerts,
}) => {
  return (
    <EuiPage>
      <EuiPageBody>
        <EuiScreenReaderOnly>
          <h1>
            <FormattedMessage
              id="xpack.monitoring.elasticsearch.indices.heading"
              defaultMessage="Elasticsearch indices"
            />
          </h1>
        </EuiScreenReaderOnly>
        <EuiPanel>
          <ClusterStatus stats={clusterStatus} alerts={alerts} />
        </EuiPanel>
        <EuiSpacer size="m" />
        <EuiPanel>
          <EuiSwitch
            label={
              <FormattedMessage
                id="xpack.monitoring.elasticsearch.indices.systemIndicesLabel"
                defaultMessage="Filter for system indices"
              />
            }
            checked={showSystemIndices}
            onChange={(e) => toggleShowSystemIndices(e.target.checked)}
          />
          <EuiSpacer size="m" />
          <EuiMonitoringTable
            data-test-subj="elasticsearchIndicesTable"
            rows={indices}
            columns={getColumns(alerts)}
            sorting={sorting}
            pagination={pagination}
            message={getNoDataMessage()}
            search={{
              box: {
                incremental: true,
                placeholder: i18n.translate(
                  'xpack.monitoring.elasticsearch.indices.monitoringTablePlaceholder',
                  {
                    defaultMessage: 'Filter Indices…',
                  }
                ),
              },
            }}
            onTableChange={onTableChange}
            executeQueryOptions={{
              defaultFields: ['name'],
            }}
          />
        </EuiPanel>
      </EuiPageBody>
    </EuiPage>
  );
};
