/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RegisteredTriggerForSchema } from '@kbn/workflows';

export const mapRegisteredTriggersForSchema = (
  triggers: Array<{
    id: string;
    title: string;
    description: string;
    stability: RegisteredTriggerForSchema['stability'];
    requiresConnectorId?: boolean;
  }>
): RegisteredTriggerForSchema[] =>
  triggers.map((trigger) => ({
    id: trigger.id,
    title: trigger.title,
    description: trigger.description,
    stability: trigger.stability,
    requiresConnectorId: trigger.requiresConnectorId,
  }));
