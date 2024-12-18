/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, createContext, useMemo } from 'react';

import { EuiFormRow, type EuiComboBoxOptionOption } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { useFieldStatsTrigger, FieldStatsInfoButton } from '@kbn/ml-field-stats-flyout';
import { type DropDownOptionWithField } from '../step_define/common/get_pivot_dropdown_options';
import type { DropDownOption } from '../../../../common';
import { AggListForm } from '../aggregation_list';
import { DropDown } from '../aggregation_dropdown';
import { GroupByListForm } from '../group_by_list';
import type { StepDefineFormHook } from '../step_define';

export const PivotConfigurationContext = createContext<
  StepDefineFormHook['pivotConfig'] | undefined
>(undefined);

export const PivotConfiguration: FC<StepDefineFormHook['pivotConfig']> = memo(
  ({ actions, state }) => {
    const { handleFieldStatsButtonClick, closeFlyout, renderOption, populatedFields } =
      useFieldStatsTrigger();

    const {
      addAggregation,
      addGroupBy,
      deleteAggregation,
      deleteGroupBy,
      updateAggregation,
      updateGroupBy,
    } = actions;

    const { aggList, aggOptions, aggOptionsData, groupByList, groupByOptions, groupByOptionsData } =
      state;

    const aggOptionsWithFieldStats: EuiComboBoxOptionOption[] = useMemo(() => {
      const opts: EuiComboBoxOptionOption[] = [];
      aggOptions.forEach(({ label, field, options }: DropDownOptionWithField) => {
        const isEmpty = populatedFields && field.id ? !populatedFields.has(field.id) : false;

        const aggOption: DropDownOption = {
          isGroupLabel: true,
          key: field.id,
          searchableLabel: label,
          // @ts-ignore Purposefully passing label as element instead of string
          // for more robust rendering
          label: (
            <FieldStatsInfoButton
              isEmpty={populatedFields && !populatedFields.has(field.id)}
              field={field}
              label={label}
              onButtonClick={handleFieldStatsButtonClick}
            />
          ),
        };

        if (options.length) {
          opts.push(aggOption);
          opts.push(
            ...options.map((o) => ({
              ...o,
              isEmpty,
              isGroupLabel: false,
              searchableLabel: o.label,
            }))
          );
        }
      });
      return opts;
    }, [aggOptions, handleFieldStatsButtonClick, populatedFields]);

    return (
      <PivotConfigurationContext.Provider value={{ actions, state }}>
        <EuiFormRow
          fullWidth
          label={i18n.translate('xpack.transform.stepDefineForm.groupByLabel', {
            defaultMessage: 'Group by',
          })}
        >
          <>
            <GroupByListForm
              list={groupByList}
              options={groupByOptionsData}
              onChange={updateGroupBy}
              deleteHandler={deleteGroupBy}
            />
            <DropDown
              changeHandler={addGroupBy}
              options={groupByOptions}
              placeholder={i18n.translate('xpack.transform.stepDefineForm.groupByPlaceholder', {
                defaultMessage: 'Add a group by field ...',
              })}
              testSubj="transformGroupBySelection"
              renderOption={renderOption}
            />
          </>
        </EuiFormRow>

        <EuiFormRow
          fullWidth
          label={i18n.translate('xpack.transform.stepDefineForm.aggregationsLabel', {
            defaultMessage: 'Aggregations',
          })}
        >
          <>
            <AggListForm
              list={aggList}
              options={aggOptionsData}
              onChange={(aggName, pivotAggsConfig) => {
                updateAggregation(aggName, pivotAggsConfig);
                closeFlyout();
              }}
              deleteHandler={deleteAggregation}
            />
            <DropDown
              changeHandler={(option) => {
                addAggregation(option);
                closeFlyout();
              }}
              options={aggOptionsWithFieldStats}
              placeholder={i18n.translate(
                'xpack.transform.stepDefineForm.aggregationsPlaceholder',
                {
                  defaultMessage: 'Add an aggregation ...',
                }
              )}
              testSubj="transformAggregationSelection"
            />
          </>
        </EuiFormRow>
      </PivotConfigurationContext.Provider>
    );
  }
);
