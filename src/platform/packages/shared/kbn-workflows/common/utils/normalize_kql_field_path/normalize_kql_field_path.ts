/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Normalizes KQL field paths for schema validation.
 * Converts bracket notation (`event.body['eventType']`) to dot notation (`event.body.eventType`).
 */
export function normalizeKqlFieldPath(field: string): string {
  return field
    .replace(/\[(['"]?)([^\]]+)\1\]/g, '.$2')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}
