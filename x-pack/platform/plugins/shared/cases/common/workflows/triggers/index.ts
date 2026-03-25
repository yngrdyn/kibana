/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { CaseResponseProperties } from '../../bundled-types.gen';
import {
  CASE_CREATED_TRIGGER_EVENT_SCHEMA_CASE_DESCRIPTION,
  CASE_UPDATED_TRIGGER_EVENT_SCHEMA_CASE_DESCRIPTION,
  CASE_UPDATED_TRIGGER_EVENT_SCHEMA_UPDATED_FIELDS_DESCRIPTION,
  COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_CASE_ID_DESCRIPTION,
  COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_COMMENTS_DESCRIPTION,
} from '../translations';

export const CaseCreatedTriggerId = 'cases.caseCreated' as const;

const caseCreatedEventSchema = z.object({
  case: CaseResponseProperties.describe(CASE_CREATED_TRIGGER_EVENT_SCHEMA_CASE_DESCRIPTION),
});

export const caseCreatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseCreatedTriggerId,
  eventSchema: caseCreatedEventSchema,
};

export const CaseUpdatedTriggerId = 'cases.caseUpdated' as const;

const caseUpdatedEventSchema = z.object({
  case: CaseResponseProperties.describe(CASE_UPDATED_TRIGGER_EVENT_SCHEMA_CASE_DESCRIPTION),
  updatedFields: z
    .array(z.string())
    .optional()
    .describe(CASE_UPDATED_TRIGGER_EVENT_SCHEMA_UPDATED_FIELDS_DESCRIPTION),
});

export const caseUpdatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseUpdatedTriggerId,
  eventSchema: caseUpdatedEventSchema,
};

export const CommentAddedTriggerId = 'cases.commentAdded' as const;

const commentAddedEventSchema = z.object({
  caseId: z.string().describe(COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_CASE_ID_DESCRIPTION),
  comments: CaseResponseProperties.shape.comments.describe(
    COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_COMMENTS_DESCRIPTION
  ),
});

export const commentAddedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CommentAddedTriggerId,
  eventSchema: commentAddedEventSchema,
};
