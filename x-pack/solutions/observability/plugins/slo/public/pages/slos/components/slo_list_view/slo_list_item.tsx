/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import { HistoricalSummaryResponse, SLOWithSummaryResponse } from '@kbn/slo-schema';
import type { Rule } from '@kbn/triggers-actions-ui-plugin/public';
import React, { useState } from 'react';
import { SloDeleteModal } from '../../../../components/slo/delete_confirmation_modal/slo_delete_confirmation_modal';
import { SloDisableConfirmationModal } from '../../../../components/slo/disable_confirmation_modal/slo_disable_confirmation_modal';
import { SloEnableConfirmationModal } from '../../../../components/slo/enable_confirmation_modal/slo_enable_confirmation_modal';
import { SloResetConfirmationModal } from '../../../../components/slo/reset_confirmation_modal/slo_reset_confirmation_modal';
import { useDisableSlo } from '../../../../hooks/use_disable_slo';
import { useEnableSlo } from '../../../../hooks/use_enable_slo';
import { useResetSlo } from '../../../../hooks/use_reset_slo';
import { BurnRateRuleParams } from '../../../../typings';
import { useSloListActions } from '../../hooks/use_slo_list_actions';
import { useSloFormattedSummary } from '../../hooks/use_slo_summary';
import { SloBadges } from '../badges/slo_badges';
import { BurnRateRuleFlyout } from '../common/burn_rate_rule_flyout';
import { EditBurnRateRuleFlyout } from '../common/edit_burn_rate_rule_flyout';
import { SLOGroupings } from '../common/slo_groupings';
import { SloItemActions } from '../slo_item_actions';
import { SloSummary } from '../slo_summary';

export interface SloListItemProps {
  slo: SLOWithSummaryResponse;
  rules?: Array<Rule<BurnRateRuleParams>>;
  historicalSummary?: HistoricalSummaryResponse[];
  historicalSummaryLoading: boolean;
  activeAlerts?: number;
  refetchRules: () => void;
}

export function SloListItem({
  slo,
  rules,
  refetchRules,
  historicalSummary = [],
  historicalSummaryLoading,
  activeAlerts,
}: SloListItemProps) {
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [isAddRuleFlyoutOpen, setIsAddRuleFlyoutOpen] = useState(false);
  const [isEditRuleFlyoutOpen, setIsEditRuleFlyoutOpen] = useState(false);
  const [isDeleteConfirmationModalOpen, setDeleteConfirmationModalOpen] = useState(false);
  const [isResetConfirmationModalOpen, setResetConfirmationModalOpen] = useState(false);
  const [isEnableConfirmationModalOpen, setEnableConfirmationModalOpen] = useState(false);
  const [isDisableConfirmationModalOpen, setDisableConfirmationModalOpen] = useState(false);

  const { mutate: resetSlo, isLoading: isResetLoading } = useResetSlo();
  const { mutate: enableSlo, isLoading: isEnableLoading } = useEnableSlo();
  const { mutate: disableSlo, isLoading: isDisableLoading } = useDisableSlo();

  const { sloDetailsUrl } = useSloFormattedSummary(slo);

  const { handleCreateRule } = useSloListActions({
    slo,
    setIsActionsPopoverOpen,
    setIsAddRuleFlyoutOpen,
  });

  const closeDeleteModal = () => {
    setDeleteConfirmationModalOpen(false);
  };

  const handleResetConfirm = () => {
    resetSlo({ id: slo.id, name: slo.name });
    setResetConfirmationModalOpen(false);
  };

  const handleResetCancel = () => {
    setResetConfirmationModalOpen(false);
  };

  const handleEnableCancel = () => {
    setEnableConfirmationModalOpen(false);
  };
  const handleEnableConfirm = () => {
    enableSlo({ id: slo.id, name: slo.name });
    setEnableConfirmationModalOpen(false);
  };

  const handleDisableCancel = () => {
    setDisableConfirmationModalOpen(false);
  };
  const handleDisableConfirm = () => {
    disableSlo({ id: slo.id, name: slo.name });
    setDisableConfirmationModalOpen(false);
  };

  return (
    <EuiPanel data-test-subj="sloItem" hasBorder hasShadow={false}>
      <EuiFlexGroup responsive={false} alignItems="center">
        {/* CONTENT */}
        <EuiFlexItem grow>
          <EuiFlexGroup>
            <EuiFlexItem grow>
              <EuiFlexGroup direction="column" gutterSize="s">
                <EuiFlexItem>
                  <EuiText size="s">
                    <>
                      <a data-test-subj="o11ySloListItemLink" href={sloDetailsUrl}>
                        {slo.name}
                      </a>
                      <SLOGroupings slo={slo} />
                    </>
                  </EuiText>
                </EuiFlexItem>
                <SloBadges
                  activeAlerts={activeAlerts}
                  isLoading={!slo.summary}
                  rules={rules}
                  slo={slo}
                  onClickRuleBadge={handleCreateRule}
                />
              </EuiFlexGroup>
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <SloSummary
                slo={slo}
                historicalSummary={historicalSummary}
                historicalSummaryLoading={historicalSummaryLoading}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        {/* ACTIONS */}
        <EuiFlexItem grow={false}>
          <SloItemActions
            slo={slo}
            rules={rules}
            isActionsPopoverOpen={isActionsPopoverOpen}
            setIsAddRuleFlyoutOpen={setIsAddRuleFlyoutOpen}
            setIsEditRuleFlyoutOpen={setIsEditRuleFlyoutOpen}
            setIsActionsPopoverOpen={setIsActionsPopoverOpen}
            setDeleteConfirmationModalOpen={setDeleteConfirmationModalOpen}
            setResetConfirmationModalOpen={setResetConfirmationModalOpen}
            setEnableConfirmationModalOpen={setEnableConfirmationModalOpen}
            setDisableConfirmationModalOpen={setDisableConfirmationModalOpen}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <BurnRateRuleFlyout
        slo={slo}
        isAddRuleFlyoutOpen={isAddRuleFlyoutOpen}
        setIsAddRuleFlyoutOpen={setIsAddRuleFlyoutOpen}
      />

      <EditBurnRateRuleFlyout
        rule={rules?.[0]}
        isEditRuleFlyoutOpen={isEditRuleFlyoutOpen}
        setIsEditRuleFlyoutOpen={setIsEditRuleFlyoutOpen}
        refetchRules={refetchRules}
      />

      {isDeleteConfirmationModalOpen ? (
        <SloDeleteModal slo={slo} onCancel={closeDeleteModal} onSuccess={closeDeleteModal} />
      ) : null}

      {isResetConfirmationModalOpen ? (
        <SloResetConfirmationModal
          slo={slo}
          onCancel={handleResetCancel}
          onConfirm={handleResetConfirm}
          isLoading={isResetLoading}
        />
      ) : null}

      {isEnableConfirmationModalOpen ? (
        <SloEnableConfirmationModal
          slo={slo}
          onCancel={handleEnableCancel}
          onConfirm={handleEnableConfirm}
          isLoading={isEnableLoading}
        />
      ) : null}

      {isDisableConfirmationModalOpen ? (
        <SloDisableConfirmationModal
          slo={slo}
          onCancel={handleDisableCancel}
          onConfirm={handleDisableConfirm}
          isLoading={isDisableLoading}
        />
      ) : null}
    </EuiPanel>
  );
}
