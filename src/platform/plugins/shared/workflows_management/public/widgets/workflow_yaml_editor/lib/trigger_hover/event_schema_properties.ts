/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

export interface EventSchemaPropertyInfo {
  name: string;
  type: string;
  description?: string;
}

/**
 * Get the shape of a Zod object schema (unwrap optional so we can read .shape).
 */
function getZodObjectShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  const s = schema as unknown as { shape?: Record<string, z.ZodType>; unwrap?: () => z.ZodType };
  if (s.shape && typeof s.shape === 'object') {
    return s.shape;
  }
  if (typeof s.unwrap === 'function') {
    const unwrapped = s.unwrap() as unknown as { shape?: Record<string, z.ZodType> };
    return unwrapped?.shape;
  }
  return undefined;
}

/**
 * Get description from a Zod schema (Zod v4 exposes .description on described schemas).
 * Unwraps optional/inner type once if needed to find the description.
 */
function getZodDescription(schema: z.ZodType): string | undefined {
  const s = schema as unknown as {
    description?: string;
    unwrap?: () => z.ZodType;
    innerType?: z.ZodType;
  };
  if (typeof s.description === 'string') return s.description;
  const unwrappedSchema = s.unwrap?.() ?? s.innerType;
  if (unwrappedSchema) return getZodDescription(unwrappedSchema);
  return undefined;
}

/** Unwrap ZodOptional once so we can inspect the inner type. */
function tryUnwrapOptional(schema: z.ZodType): z.ZodType {
  const s = schema as unknown as { unwrap?: () => z.ZodType };
  return typeof s.unwrap === 'function' ? s.unwrap() : schema;
}

/** Infer a display type name from a Zod schema (e.g. string, object, number). */
function getZodTypeName(schema: z.ZodType): string {
  const unwrapped = tryUnwrapOptional(schema);
  try {
    const json = z.toJSONSchema(unwrapped) as Record<string, unknown>;
    if (json.type === 'object' && json.properties) return 'object';
    if (typeof json.type === 'string') return json.type;
    if (Array.isArray(json.type)) return (json.type as string[]).join(' | ');
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

const DEFAULT_EVENT_SCHEMA_MAX_DEPTH = 20;

/**
 * Recursively collect event schema properties (including nested objects).
 * Each property is emitted with a dotted path (e.g. foo, foo.bar, foo.bar.baz).
 */
function getEventSchemaPropertiesRecursive(
  schema: z.ZodType,
  prefix: string,
  currentDepth: number,
  maxDepth: number = DEFAULT_EVENT_SCHEMA_MAX_DEPTH,
  visited: WeakSet<object> = new WeakSet()
): EventSchemaPropertyInfo[] {
  if (visited.has(schema as unknown as object)) return [];
  visited.add(schema as unknown as object);

  const shape = getZodObjectShape(schema);
  if (!shape || typeof shape !== 'object') return [];

  const result: EventSchemaPropertyInfo[] = [];

  for (const [key, subSchema] of Object.entries(shape)) {
    const fullName = prefix ? `${prefix}.${key}` : key;
    const description = getZodDescription(subSchema);
    const innerShape = getZodObjectShape(subSchema);

    if (innerShape && Object.keys(innerShape).length > 0 && currentDepth < maxDepth) {
      result.push({ name: fullName, type: 'object', description });
      result.push(
        ...getEventSchemaPropertiesRecursive(
          subSchema,
          fullName,
          currentDepth + 1,
          maxDepth,
          visited
        )
      );
    } else {
      result.push({
        name: fullName,
        type: getZodTypeName(subSchema),
        description,
      });
    }
  }

  return result;
}

/**
 * Extract event schema properties from a Zod schema (payload shape under `triggers[].on.condition` —
 * paths are relative to `event.` in KQL).
 */
export function getEventSchemaProperties(eventSchema: z.ZodType): EventSchemaPropertyInfo[] {
  try {
    return getEventSchemaPropertiesRecursive(
      eventSchema,
      '',
      0,
      DEFAULT_EVENT_SCHEMA_MAX_DEPTH,
      new WeakSet()
    );
  } catch {
    return [];
  }
}
