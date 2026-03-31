/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { Owner } from '../../common/constants/types';

/**
 * Base metadata carried with every Cases domain event for routing.
 */
export interface CasesEventMetadata {
  readonly request: KibanaRequest;
  readonly spaceId: string;
}

/**
 * Event: case created
 */
interface BaseCaseEventPayload {
  readonly owner: Owner;
}

export interface CaseCreatedEventPayload extends BaseCaseEventPayload {
  readonly caseId: string;
}

/**
 * Event: case updated
 */
export interface CaseUpdatedEventPayload extends BaseCaseEventPayload {
  readonly caseId: string;
  readonly updatedFields?: string[];
}

/**
 * Event: comment added
 */
export interface CommentAddedEventPayload extends BaseCaseEventPayload {
  readonly caseId: string;
  readonly caseCommentIds: string[];
}

export interface CasesDomainEventPayloadByType {
  readonly caseCreated: CaseCreatedEventPayload;
  readonly caseUpdated: CaseUpdatedEventPayload;
  readonly commentAdded: CommentAddedEventPayload;
}

export type CasesDomainEventType = keyof CasesDomainEventPayloadByType;

export interface CasesEventPayload<TType extends CasesDomainEventType = CasesDomainEventType> {
  readonly type: TType;
  readonly payload: CasesDomainEventPayloadByType[TType];
  readonly metadata: CasesEventMetadata;
}
