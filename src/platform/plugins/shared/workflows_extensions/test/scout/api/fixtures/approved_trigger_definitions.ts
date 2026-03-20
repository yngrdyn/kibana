/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * APPROVED TRIGGER DEFINITIONS
 *
 * This list must be kept up-to-date with all registered trigger definitions.
 * When a new trigger is registered, developers must:
 * 1. Add the trigger ID and schema hash to this list (alphabetically sorted)
 * 2. Get approval from the workflows-eng team
 *
 * If the event schema changes, the schema hash must be updated, and get the approval again.
 *
 * Example of an approved trigger definition entry:
 * {
 *   id: 'cases.updated',
 *   schemaHash: 'a1b2c3d4e5f6...',
 * },
 *
 * To get the schemaHash for a trigger: run the server, then GET internal/workflows_extensions/trigger_definitions
 * and copy the schemaHash from the response for the trigger id.
 */
export const APPROVED_TRIGGER_DEFINITIONS: Array<{ id: string; schemaHash: string }> = [
  {
    id: 'cases.caseCreated',
    schemaHash: '93307750c1c97f052ac7b32622b537fac4bd90c06ccd013e61e06a8431ac8d7c',
  },
  {
    id: 'cases.caseUpdated',
    schemaHash: '50371cd51ca4cc1134a931a79d0afd7d07a2864f1373cae317c41f151fbb6864',
  },
  {
    id: 'cases.commentAdded',
    schemaHash: '7df948ac64d551ac6c2319b59fcc8bd08afee46ed40cf8fe6f63a80835d63eeb',
  },
];
