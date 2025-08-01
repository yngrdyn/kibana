/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import type { PartialRuleDiff, RuleFieldsDiff } from '../../../../../common/api/detection_engine';
import { getFormattedFieldDiffGroups } from './per_field_diff/get_formatted_field_diff';
import { UPGRADE_FIELD_ORDER } from './constants';
import type { RuleDiffHeaderBarProps } from './diff_components';
import { RuleDiffHeaderBar, RuleDiffSection } from './diff_components';
import { filterUnsupportedDiffOutcomes, getSectionedFieldDiffs } from './helpers';
import type { FieldsGroupDiff, DiffLayout } from '../../model/rule_details/rule_field_diff';
import * as i18n from './translations';

interface PerFieldRuleDiffTabProps extends RuleDiffHeaderBarProps {
  ruleDiff: PartialRuleDiff;
  header?: React.ReactNode;
  diffLayout?: DiffLayout;
}

export const PerFieldRuleDiffTab = ({
  ruleDiff,
  header,
  leftDiffSideLabel,
  rightDiffSideLabel,
  leftDiffSideDescription,
  rightDiffSideDescription,
  diffLayout,
}: PerFieldRuleDiffTabProps) => {
  const fieldsToRender = useMemo(() => {
    const fields: FieldsGroupDiff[] = [];
    // Filter out diff outcomes that we don't support displaying in the per-field diff flyout
    const filteredFieldDiffs = filterUnsupportedDiffOutcomes(ruleDiff.fields);
    for (const field of Object.keys(filteredFieldDiffs)) {
      const typedField = field as keyof RuleFieldsDiff;
      const formattedDiffs = getFormattedFieldDiffGroups(typedField, filteredFieldDiffs);
      fields.push({ formattedDiffs, fieldsGroupName: typedField });
    }
    const sortedFields = fields.sort(
      (a, b) =>
        UPGRADE_FIELD_ORDER.indexOf(a.fieldsGroupName) -
        UPGRADE_FIELD_ORDER.indexOf(b.fieldsGroupName)
    );
    return sortedFields;
  }, [ruleDiff.fields]);

  const { aboutFields, definitionFields, scheduleFields, setupFields } = useMemo(
    () => getSectionedFieldDiffs(fieldsToRender),
    [fieldsToRender]
  );

  return (
    <>
      <RuleDiffHeaderBar
        leftDiffSideLabel={leftDiffSideLabel}
        rightDiffSideLabel={rightDiffSideLabel}
        leftDiffSideDescription={leftDiffSideDescription}
        rightDiffSideDescription={rightDiffSideDescription}
      />
      {header}
      {aboutFields.length !== 0 && (
        <RuleDiffSection
          title={i18n.ABOUT_SECTION_LABEL}
          fieldGroups={aboutFields}
          diffLayout={diffLayout}
          dataTestSubj="perFieldDiffAboutSection"
        />
      )}
      {definitionFields.length !== 0 && (
        <RuleDiffSection
          title={i18n.DEFINITION_SECTION_LABEL}
          fieldGroups={definitionFields}
          diffLayout={diffLayout}
          dataTestSubj="perFieldDiffDefinitionSection"
        />
      )}
      {scheduleFields.length !== 0 && (
        <RuleDiffSection
          title={i18n.SCHEDULE_SECTION_LABEL}
          fieldGroups={scheduleFields}
          diffLayout={diffLayout}
          dataTestSubj="perFieldDiffScheduleSection"
        />
      )}
      {setupFields.length !== 0 && (
        <RuleDiffSection
          title={i18n.SETUP_GUIDE_SECTION_LABEL}
          fieldGroups={setupFields}
          diffLayout={diffLayout}
          dataTestSubj="perFieldDiffSetupSection"
        />
      )}
    </>
  );
};
