/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { Case } from '../../common/types/domain';

/**
 * Base metadata carried with every Cases domain event for routing.
 */
export interface CasesEventMetadata {
  readonly request: KibanaRequest;
  readonly spaceId: string;
}

/**
 * Case shape shared by cases domain events.
 * Requires an id while preserving known Case fields when present.
 */
export type CasesEventCase = Pick<Case, 'id'> & Partial<Omit<Case, 'id'>>;

/**
 * Event: case created
 */
export interface CaseCreatedEventPayload {
  readonly case: CasesEventCase;
}

/**
 * Event: case updated
 */
export interface CaseUpdatedEventPayload {
  readonly case: CasesEventCase;
  readonly updatedFields?: string[];
}

/**
 * Event: comment added
 */
export interface CommentAddedEventPayload {
  readonly caseId: string;
  readonly comments: NonNullable<Case['comments']>;
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
