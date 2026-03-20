/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { CaseResponseProperties } from '../../bundled-types.gen';

export const CaseCreatedTriggerId = 'cases.caseCreated' as const;

const caseCreatedEventSchema = z.object({
  case: CaseResponseProperties.describe('The created case.'),
});

export const caseCreatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseCreatedTriggerId,
  eventSchema: caseCreatedEventSchema,
};

export const CaseUpdatedTriggerId = 'cases.caseUpdated' as const;

const caseUpdatedEventSchema = z.object({
  case: CaseResponseProperties.describe('The updated case.'),
  updatedFields: z
    .array(z.string())
    .optional()
    .describe('A list of case fields updated by this operation.'),
});

export const caseUpdatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseUpdatedTriggerId,
  eventSchema: caseUpdatedEventSchema,
};

export const CommentAddedTriggerId = 'cases.commentAdded' as const;

const commentAddedEventSchema = z.object({
  caseId: z.string().describe('The ID of the case the comments were added to.'),
  comments: CaseResponseProperties.shape.comments.describe('The comments that were added.'),
});

export const commentAddedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CommentAddedTriggerId,
  eventSchema: commentAddedEventSchema,
};
