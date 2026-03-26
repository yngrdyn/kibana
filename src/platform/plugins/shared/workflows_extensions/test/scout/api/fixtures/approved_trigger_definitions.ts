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
    schemaHash: 'a1cb488a107224d6e2dd82526b142105f825e02021d451f1464384ea048657d9',
  },
  {
    id: 'cases.caseUpdated',
    schemaHash: 'fd2bd8fbd9abdd9ee35c9706775e1aca1ceb8734ff975c357cd5c5312ded86be',
  },
  {
    id: 'cases.commentAdded',
    schemaHash: '4f3fd27ec765e3cee8492dca2f775c88c6e913ef208e84b0ba749db644f94bf3',
  },
];
