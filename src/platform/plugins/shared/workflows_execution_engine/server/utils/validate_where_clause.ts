/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License v 1".
 */

import { fromKueryExpression } from '@kbn/es-query';
import type { z } from '@kbn/zod/v4';
import { extractPropertyPathsFromKql } from '@kbn/workflows/common/utils/extract_property_paths_from_kql/extract_property_paths_from_kql';
import { getSchemaAtPath } from '@kbn/workflows/common/utils/zod/get_schema_at_path';

/**
 * Validates that a KQL where clause only uses properties from the event schema.
 *
 * @param whereClause - The KQL query string to validate
 * @param eventSchema - The Zod schema for the event (trigger's eventSchema)
 * @returns Object with isValid flag and optional error message
 */
export function validateWhereClause(
  whereClause: string,
  eventSchema: z.ZodType
): { isValid: boolean; error?: string } {
  if (!whereClause || !whereClause.trim()) {
    return { isValid: true };
  }

  try {
    // Parse the KQL query to validate syntax
    fromKueryExpression(whereClause);
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid KQL syntax: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Extract property paths from the KQL query
  const propertyPaths = extractPropertyPathsFromKql(whereClause);

  // Validate each property path exists in the event schema
  // Note: In the where clause, users reference properties as event.propertyName,
  // but the eventSchema is just the payload schema (not wrapped in an event object).
  // So we need to strip the "event." prefix before validating.
  const invalidPaths: string[] = [];
  for (const path of propertyPaths) {
    // Strip "event." prefix if present
    const schemaPath = path.startsWith('event.') ? path.substring(6) : path;
    
    // Skip validation for template variables (they're validated at runtime)
    if (schemaPath.includes('{{') || schemaPath.includes('}}')) {
      continue;
    }
    
    const { schema } = getSchemaAtPath(eventSchema, schemaPath);
    if (!schema) {
      invalidPaths.push(path); // Report the original path (with event. prefix) in the error
    }
  }

  if (invalidPaths.length > 0) {
    return {
      isValid: false,
      error: `Where clause references properties that are not in the event schema: ${invalidPaths.join(', ')}`,
    };
  }

  return { isValid: true };
}
