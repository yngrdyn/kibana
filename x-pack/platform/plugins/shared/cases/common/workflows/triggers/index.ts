/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { CommonTriggerDefinition } from '@kbn/workflows-extensions/common';
import { Owner as OwnerSchema } from '../../bundled-types.gen';
import {
  CASE_TRIGGER_EVENT_SCHEMA_CASE_ID_DESCRIPTION,
  CASE_TRIGGER_EVENT_SCHEMA_OWNER_DESCRIPTION,
  CASE_UPDATED_TRIGGER_EVENT_SCHEMA_UPDATED_FIELDS_DESCRIPTION,
  COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_CASE_COMMENT_IDS_DESCRIPTION,
} from '../translations';

export const CaseCreatedTriggerId = 'cases.caseCreated' as const;

const baseCaseEventSchema = z.object({
  owner: OwnerSchema.meta({ description: CASE_TRIGGER_EVENT_SCHEMA_OWNER_DESCRIPTION }),
  caseId: z.string().meta({ description: CASE_TRIGGER_EVENT_SCHEMA_CASE_ID_DESCRIPTION }),
});

export const caseCreatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseCreatedTriggerId,
  eventSchema: baseCaseEventSchema,
};

export const CaseUpdatedTriggerId = 'cases.caseUpdated' as const;

const caseUpdatedEventSchema = baseCaseEventSchema.extend({
  updatedFields: z
    .array(z.string())
    .optional()
    .meta({ description: CASE_UPDATED_TRIGGER_EVENT_SCHEMA_UPDATED_FIELDS_DESCRIPTION }),
});

export const caseUpdatedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CaseUpdatedTriggerId,
  eventSchema: caseUpdatedEventSchema,
};

export const CommentAddedTriggerId = 'cases.commentAdded' as const;

const commentAddedEventSchema = baseCaseEventSchema.extend({
  caseCommentIds: z
    .array(z.string())
    .meta({ description: COMMENT_ADDED_TRIGGER_EVENT_SCHEMA_CASE_COMMENT_IDS_DESCRIPTION }),
});

export const commentAddedTriggerCommonDefinition: CommonTriggerDefinition = {
  id: CommentAddedTriggerId,
  eventSchema: commentAddedEventSchema,
};
