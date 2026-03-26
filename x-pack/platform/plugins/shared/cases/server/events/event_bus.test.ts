/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { CasesEventBus } from './event_bus';

describe('CasesEventBus', () => {
  const metadata = {
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'default',
  };

  it('emits case created events', () => {
    const eventBus = new CasesEventBus();
    const listener = jest.fn();

    eventBus.onCaseCreated(listener);
    eventBus.emitCaseCreated(metadata, { caseId: 'case-1' });

    expect(listener).toHaveBeenCalledWith({
      type: 'caseCreated',
      metadata,
      payload: { caseId: 'case-1' },
    });
  });

  it('emits case updated events with updated fields', () => {
    const eventBus = new CasesEventBus();
    const listener = jest.fn();

    eventBus.onCaseUpdated(listener);
    eventBus.emitCaseUpdated(metadata, {
      caseId: 'case-1',
      updated_fields: ['status'],
    });

    expect(listener).toHaveBeenCalledWith({
      type: 'caseUpdated',
      metadata,
      payload: { caseId: 'case-1', updated_fields: ['status'] },
    });
  });

  it('removes listeners', () => {
    const eventBus = new CasesEventBus();
    const listener = jest.fn();

    eventBus.onCommentAdded(listener);
    eventBus.removeCommentAddedListener(listener);
    eventBus.emitCommentAdded(metadata, { caseId: 'case-1', caseCommentIds: [] });

    expect(listener).not.toHaveBeenCalled();
  });
});
