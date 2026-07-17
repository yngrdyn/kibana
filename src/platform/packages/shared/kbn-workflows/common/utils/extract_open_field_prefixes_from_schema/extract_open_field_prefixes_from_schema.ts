/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ZodType } from '@kbn/zod/v4';
import { isZod, z } from '@kbn/zod/v4';

function unwrapOptionalNullable(schema: ZodType): ZodType {
  let current: ZodType = schema;
  let def = current.def as { type?: string } | undefined;
  while (def?.type === 'optional' || def?.type === 'nullable') {
    current = (current as z.ZodOptional<ZodType>).unwrap();
    def = current.def as { type?: string } | undefined;
  }
  return current;
}

function isOpenSchemaType(schema: ZodType): boolean {
  const core = unwrapOptionalNullable(schema);
  return core instanceof z.ZodUnknown || core instanceof z.ZodAny || core instanceof z.ZodRecord;
}

function extractOpenFieldPrefixesRecursive(
  zodSchema: ZodType,
  prefix: string,
  out: Set<string>
): void {
  if (!zodSchema || typeof zodSchema !== 'object') {
    return;
  }

  if (zodSchema instanceof z.ZodObject) {
    const shape = zodSchema.shape;
    for (const [key, value] of Object.entries(shape)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const valueSchema = value as ZodType;
      if (isOpenSchemaType(valueSchema)) {
        out.add(currentPath);
      } else {
        extractOpenFieldPrefixesRecursive(valueSchema, currentPath, out);
      }
    }
    return;
  }

  if (zodSchema.def?.type === 'record') {
    if (prefix) {
      out.add(prefix);
    }
    const valueType = (zodSchema as z.ZodRecord).valueType as ZodType | undefined;
    if (valueType && !isOpenSchemaType(valueType)) {
      extractOpenFieldPrefixesRecursive(valueType, prefix, out);
    }
    return;
  }

  if (zodSchema.def && (zodSchema.def.type === 'optional' || zodSchema.def.type === 'nullable')) {
    extractOpenFieldPrefixesRecursive((zodSchema as z.ZodOptional<ZodType>).unwrap(), prefix, out);
    return;
  }

  if (zodSchema instanceof z.ZodArray) {
    const elementType = zodSchema.element as ZodType;
    extractOpenFieldPrefixesRecursive(elementType, prefix, out);
  }
}

/**
 * Returns schema paths whose values accept arbitrary nested KQL field paths.
 * Used for inbound webhook `body: z.unknown()` and other dynamic payload shapes.
 */
export function extractOpenFieldPrefixesFromSchema(zodSchema: unknown): string[] {
  if (!isZod(zodSchema)) {
    return [];
  }

  const prefixes = new Set<string>();
  extractOpenFieldPrefixesRecursive(zodSchema as ZodType, '', prefixes);
  return [...prefixes].sort();
}
