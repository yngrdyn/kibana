/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiPortal,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import { SERVICE_NAME } from '@kbn/apm-plugin/common/elasticsearch_fieldnames';
import { AgentName } from '@kbn/apm-plugin/typings/es_schemas/ui/fields/agent';
import { i18n } from '@kbn/i18n';
import { NOT_AVAILABLE_LABEL } from '../../../../../common/i18n';
import React from 'react';
import { AgentIcon } from '../../../shared/agent_icon';
import { StickyProperties } from '../../../shared/sticky_properties';
import { TruncateWithTooltip } from '../../../shared/truncate_with_tooltip';
import { AgentExplorerDocsLink } from '../../agent_explorer_docs_link';
import { AgentInstancesDetails } from '../../agent_explorer_instance';
import { ResponsiveFlyout } from '../../transaction_details/waterfall_with_summary/waterfall_container/waterfall/responsive_flyout';
import { AgentExplorerItem } from '../agent_list';

function formatString(value?: string | null) {
  return value || NOT_AVAILABLE_LABEL;
}

export function FlyoutTopLevelProperties({ agentName, serviceName, agentLastVersion, agentRepoUrl }: AgentExplorerItem) {

  const stickyProperties = [
    {
      label: i18n.translate('xpack.apm.transactionDetails.serviceLabel', {
        defaultMessage: 'Service',
      }),
      fieldName: SERVICE_NAME,
      val: (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <AgentIcon agentName={agentName} />
          </EuiFlexItem>
          <EuiFlexItem className="eui-textTruncate">
            <span className="eui-textTruncate">{serviceName}</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      width: '20%',
    },
    {
      label: i18n.translate('xpack.apm.transactionDetails.serviceLabel', {
        defaultMessage: 'Agent Name',
      }),
      fieldName: SERVICE_NAME,
      val: (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem className="eui-textTruncate">
            <span className="eui-textTruncate">{agentName}</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      width: '20%',
    },
    {
      label: i18n.translate('xpack.apm.transactionDetails.serviceLabel', {
        defaultMessage: 'Instances',
      }),
      fieldName: SERVICE_NAME,
      val: (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem className="eui-textTruncate">
            <span className="eui-textTruncate">6</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      width: '20%',
    },
    {
      label: i18n.translate('xpack.apm.transactionDetails.serviceLabel', {
        defaultMessage: 'Latest version',
      }),
      fieldName: SERVICE_NAME,
      val: (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem className="eui-textTruncate">
            <span className="eui-textTruncate">{agentLastVersion}</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      width: '20%',
    },
    {
      label: i18n.translate('xpack.apm.transactionDetails.serviceLabel', {
        defaultMessage: 'Agent documentation',
      }),
      fieldName: SERVICE_NAME,
      val: (
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
      width: '20%',
    },
  ];

  return <StickyProperties stickyProperties={stickyProperties} />;
}

interface Props {
  agent: AgentExplorerItem;
  onClose: () => void;
  /* transaction?: Transaction;
  errorCount?: number;
  rootTransactionDuration?: number;
  spanLinksCount: SpanLinksCount; */
}

export function AgentInstances({
  agent,
  onClose,
  /* errorCount = 0,
  rootTransactionDuration,
  spanLinksCount, */
}: Props) {
  /* if (!transactionDoc) {
    return null;
  } */

  /* const spanLinksTabContent = getSpanLinksTabContent({
    spanLinksCount,
    traceId: transactionDoc.trace.id,
    spanId: transactionDoc.transaction.id,
    processorEvent: ProcessorEvent.transaction,
  }); */

  return (
    <EuiPortal>
      <ResponsiveFlyout onClose={onClose} ownFocus={true} maxWidth={false}>
        <EuiFlyoutHeader hasBorder>
          <EuiFlexGroup>
            <EuiFlexItem grow={false}>
              <EuiTitle>
                <h4>
                  {i18n.translate(
                    'xpack.apm.agentExplorer.instancesFlyout.title',
                    {
                      defaultMessage: 'Agent Instances',
                    }
                  )}
                </h4>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <FlyoutTopLevelProperties {...agent} />
          <EuiHorizontalRule margin="m" />
          <EuiSpacer size="m" />
          <AgentInstancesDetails serviceName={agent.serviceName} />
        </EuiFlyoutBody>
      </ResponsiveFlyout>
    </EuiPortal>
  );
}
