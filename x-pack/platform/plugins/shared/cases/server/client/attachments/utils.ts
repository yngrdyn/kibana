/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Case } from '../../../common/types/domain';
import type { CasesClientArgs } from '..';

export function emitCommentAddedEvent(
  clientArgs: CasesClientArgs,
  updatedCase: Case,
  newCommentIds: string[]
): void {
  const idSet = new Set(newCommentIds);
  clientArgs.casesEventBus?.emitCommentAdded(clientArgs.casesEventMetadata, {
    caseId: updatedCase.id,
    comments: (updatedCase.comments ?? []).filter((c) => idSet.has(c.id)),
  });
}
