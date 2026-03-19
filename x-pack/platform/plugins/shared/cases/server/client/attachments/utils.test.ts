/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Case } from '../../../common/types/domain';
import { createCasesClientMockArgs } from '../mocks';
import { emitCommentAddedEvent } from './utils';

const makeCase = (id: string, comments: Array<{ id: string }>): Case =>
  ({ id, comments } as unknown as Case);

describe('emitCommentAddedEvent', () => {
  it('emits commentAdded with the matching comments filtered by id', () => {
    const clientArgs = createCasesClientMockArgs();
    const comment1 = { id: 'comment-1' };
    const comment2 = { id: 'comment-2' };
    const updatedCase = makeCase('case-1', [comment1, comment2]);

    emitCommentAddedEvent(clientArgs, updatedCase, ['comment-1']);

    expect(clientArgs.casesEventBus.emitCommentAdded).toHaveBeenCalledWith(
      clientArgs.casesEventMetadata,
      { caseId: 'case-1', comments: [comment1] }
    );
  });

  it('emits all comments whose ids are in newCommentIds', () => {
    const clientArgs = createCasesClientMockArgs();
    const comment1 = { id: 'comment-1' };
    const comment2 = { id: 'comment-2' };
    const comment3 = { id: 'comment-3' };
    const updatedCase = makeCase('case-1', [comment1, comment2, comment3]);

    emitCommentAddedEvent(clientArgs, updatedCase, ['comment-1', 'comment-3']);

    expect(clientArgs.casesEventBus.emitCommentAdded).toHaveBeenCalledWith(
      clientArgs.casesEventMetadata,
      { caseId: 'case-1', comments: [comment1, comment3] }
    );
  });

  it('emits empty comments array when no ids match', () => {
    const clientArgs = createCasesClientMockArgs();
    const updatedCase = makeCase('case-1', [{ id: 'comment-1' }]);

    emitCommentAddedEvent(clientArgs, updatedCase, ['comment-99']);

    expect(clientArgs.casesEventBus.emitCommentAdded).toHaveBeenCalledWith(
      clientArgs.casesEventMetadata,
      { caseId: 'case-1', comments: [] }
    );
  });

  it('emits empty comments array when updatedCase.comments is undefined', () => {
    const clientArgs = createCasesClientMockArgs();
    const updatedCase = makeCase('case-1', undefined as unknown as []);

    emitCommentAddedEvent(clientArgs, updatedCase, ['comment-1']);

    expect(clientArgs.casesEventBus.emitCommentAdded).toHaveBeenCalledWith(
      clientArgs.casesEventMetadata,
      { caseId: 'case-1', comments: [] }
    );
  });

  it('does nothing when casesEventBus is absent', () => {
    const clientArgs = createCasesClientMockArgs();
    clientArgs.casesEventBus = undefined as unknown as typeof clientArgs.casesEventBus;
    const updatedCase = makeCase('case-1', [{ id: 'comment-1' }]);

    expect(() => emitCommentAddedEvent(clientArgs, updatedCase, ['comment-1'])).not.toThrow();
  });
});
