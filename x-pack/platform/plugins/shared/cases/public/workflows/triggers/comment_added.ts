/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { DataMapStepTypeId } from '@kbn/workflows-extensions/common';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import {
  CommentAddedTriggerId,
  commentAddedTriggerCommonDefinition,
} from '../../../common/workflows/triggers';

export const commentAddedTriggerPublicDefinition: PublicTriggerDefinition = {
  ...commentAddedTriggerCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/app_cases').then(({ icon }) => ({
      default: icon,
    }))
  ),
  title: i18n.translate('xpack.cases.workflowTriggers.commentAdded.title', {
    defaultMessage: 'Cases - Comment added',
  }),
  description: i18n.translate('xpack.cases.workflowTriggers.commentAdded.description', {
    defaultMessage: 'Emitted when a comment is added to a case.',
  }),
  documentation: {
    details: i18n.translate('xpack.cases.workflowTriggers.commentAdded.documentation.details', {
      defaultMessage:
        'Emitted after new comments are attached to a case. The payload includes event.caseId, event.owner, and event.caseCommentIds (only IDs added in that operation). Use KQL on event.* for trigger conditions.',
    }),
    examples: [
      i18n.translate('xpack.cases.workflowTriggers.commentAdded.documentation.exampleCaseFilter', {
        defaultMessage: `## Run only for Security cases
\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.owner: "securitySolution"'
\`\`\``,
        values: {
          triggerId: CommentAddedTriggerId,
        },
      }),
      i18n.translate(
        'xpack.cases.workflowTriggers.commentAdded.documentation.exampleMapCommentIds',
        {
          defaultMessage: `## Map each added comment ID for Security cases
Use {mapStepType} to walk \`context.event.caseCommentIds\`.

\`\`\`yaml
triggers:
  - type: {triggerId}
    on:
      condition: 'event.owner: "securitySolution"'
steps:
  - name: each_added_comment_id
    type: {mapStepType}
    items: "{caseCommentIdsExpression}"
    with:
      fields:
        comment_id: "{itemExpression}"
\`\`\``,
          values: {
            triggerId: CommentAddedTriggerId,
            mapStepType: DataMapStepTypeId,
            caseCommentIdsExpression: '${{ context.event.caseCommentIds }}',
            itemExpression: '${{ item }}',
          },
        }
      ),
    ],
  },
};
