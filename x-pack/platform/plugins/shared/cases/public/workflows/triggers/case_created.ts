/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import {
  CaseCreatedTriggerId,
  caseCreatedTriggerCommonDefinition,
} from '../../../common/workflows/triggers';

export const caseCreatedTriggerPublicDefinition: PublicTriggerDefinition = {
  ...caseCreatedTriggerCommonDefinition,
  title: i18n.translate('xpack.cases.workflowTriggers.caseCreated.title', {
    defaultMessage: 'Cases - Case created',
  }),
  description: i18n.translate('xpack.cases.workflowTriggers.caseCreated.description', {
    defaultMessage: 'Emitted when a case is created.',
  }),
  documentation: {
    details: i18n.translate('xpack.cases.workflowTriggers.caseCreated.documentation.details', {
      defaultMessage:
        'Emitted after a case is created. The payload includes event.caseId, which you can use in trigger conditions.',
    }),
    examples: [
      i18n.translate('xpack.cases.workflowTriggers.caseCreated.documentation.example', {
        defaultMessage: `## Run for a specific case
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.caseId: "YOUR_CASE_ID"'
\`\`\``,
        values: {
          triggerId: CaseCreatedTriggerId,
        },
      }),
    ],
  },
  snippets: {
    condition: 'event.caseId: "YOUR_CASE_ID"',
  },
};
