/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

/** One schema property for docs (required/optional, type, optional description). */
export interface SchemaProperty {
  name: string;
  required: boolean;
  type: string;
  description?: string;
}

function getJsonSchemaType(prop: Record<string, unknown>): string {
  if (typeof prop.type === 'string') {
    return prop.type;
  }
  const anyOf = prop.anyOf as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(anyOf)) {
    const first = anyOf.find((s) => s.type !== 'null');
    return first && typeof first.type === 'string' ? first.type : 'unknown';
  }
  const oneOf = prop.oneOf as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(oneOf)) {
    const first = oneOf.find((s) => s.type !== 'null');
    return first && typeof first.type === 'string' ? first.type : 'unknown';
  }
  return 'unknown';
}

function jsonSchemaToProperties(jsonSchema: Record<string, unknown>): SchemaProperty[] | null {
  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (typeof properties !== 'object' || properties === null) {
    return null;
  }
  const required = new Set<string>(
    Array.isArray(jsonSchema.required) ? (jsonSchema.required as string[]) : []
  );
  const schemaProperties = Object.entries(properties).map(([name, prop]) => {
    const propObj = typeof prop === 'object' && prop !== null ? prop : {};
    return {
      name,
      required: required.has(name),
      type: getJsonSchemaType(propObj),
      description:
        typeof propObj.description === 'string' ? (propObj.description as string) : undefined,
    };
  });
  return schemaProperties.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function schemaToProperties(schema: z.ZodType): SchemaProperty[] | null {
  try {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    return jsonSchemaToProperties(jsonSchema);
  } catch {
    return null;
  }
}
