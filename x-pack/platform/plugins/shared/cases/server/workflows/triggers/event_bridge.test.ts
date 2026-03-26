/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { workflowsExtensionsMock } from '@kbn/workflows-extensions/server/mocks';
import {
  CaseCreatedTriggerId,
  CaseUpdatedTriggerId,
  CommentAddedTriggerId,
} from '../../../common/workflows/triggers';
import { CasesEventBus } from '../../events/event_bus';
import { registerCasesWorkflowEventBridge } from './event_bridge';

const flushMicrotasks = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('registerCasesWorkflowEventBridge', () => {
  it('forwards cases events to workflows extensions', async () => {
    const eventBus = new CasesEventBus();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    const logger = loggingSystemMock.createLogger();
    const request = httpServerMock.createKibanaRequest();

    registerCasesWorkflowEventBridge(eventBus, workflowsExtensions, logger);

    eventBus.emitCaseCreated({ request, spaceId: 'default' }, { caseId: 'case-1' });
    eventBus.emitCaseUpdated(
      { request, spaceId: 'default' },
      { caseId: 'case-1', updated_fields: ['status'] }
    );
    eventBus.emitCommentAdded(
      { request, spaceId: 'default' },
      { caseId: 'case-1', caseCommentIds: [] }
    );

    await flushMicrotasks();

    expect(workflowsExtensions.emitEvent).toHaveBeenCalledTimes(3);
    expect(workflowsExtensions.emitEvent).toHaveBeenNthCalledWith(1, {
      triggerId: CaseCreatedTriggerId,
      payload: { caseId: 'case-1' },
      request,
      spaceId: 'default',
    });
    expect(workflowsExtensions.emitEvent).toHaveBeenNthCalledWith(2, {
      triggerId: CaseUpdatedTriggerId,
      payload: { caseId: 'case-1', updated_fields: ['status'] },
      request,
      spaceId: 'default',
    });
    expect(workflowsExtensions.emitEvent).toHaveBeenNthCalledWith(3, {
      triggerId: CommentAddedTriggerId,
      payload: { caseId: 'case-1', caseCommentIds: [] },
      request,
      spaceId: 'default',
    });
  });

  it('logs warning when forwarding fails', async () => {
    const eventBus = new CasesEventBus();
    const workflowsExtensions = workflowsExtensionsMock.createStart();
    const logger = loggingSystemMock.createLogger();
    const request = httpServerMock.createKibanaRequest();

    workflowsExtensions.emitEvent.mockRejectedValue(new Error('boom'));
    registerCasesWorkflowEventBridge(eventBus, workflowsExtensions, logger);

    eventBus.emitCaseCreated({ request, spaceId: 'default' }, { caseId: 'case-1' });

    await flushMicrotasks();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to emit workflow trigger "${CaseCreatedTriggerId}"`)
    );
  });
});
