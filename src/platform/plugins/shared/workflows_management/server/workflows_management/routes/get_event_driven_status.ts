/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { WORKFLOW_ROUTE_OPTIONS } from './route_constants';
import { WORKFLOW_READ_SECURITY } from './route_security';
import { EVENT_DRIVEN_STATUS_PATH } from '../../../common/routes';
import type { WorkflowsRouter } from '../../types';
import { withLicenseCheck } from '../lib/with_license_check';

export function registerGetEventDrivenStatusRoute({
  router,
  getIsEventDrivenExecutionEnabled,
}: {
  router: WorkflowsRouter;
  getIsEventDrivenExecutionEnabled: () => boolean;
}) {
  router.get(
    {
      path: EVENT_DRIVEN_STATUS_PATH,
      options: WORKFLOW_ROUTE_OPTIONS,
      security: WORKFLOW_READ_SECURITY,
      validate: false,
    },
    withLicenseCheck(async (_context, request, response) => {
      const eventDrivenExecutionEnabled = getIsEventDrivenExecutionEnabled();
      return response.ok({
        body: { eventDrivenExecutionEnabled },
      });
    })
  );
}
