/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { inboundWebhookReceivedEventSchema } from '@kbn/connector-specs';
import { z } from '@kbn/zod/v4';
import { extractOpenFieldPrefixesFromSchema } from './extract_open_field_prefixes_from_schema';

describe('extractOpenFieldPrefixesFromSchema', () => {
  it('returns body for inbound webhook received schema', () => {
    expect(extractOpenFieldPrefixesFromSchema(inboundWebhookReceivedEventSchema)).toEqual(['body']);
  });

  it('returns record paths for dynamic maps', () => {
    const schema = z.object({
      headers: z.record(z.string(), z.string()),
    });
    expect(extractOpenFieldPrefixesFromSchema(schema)).toEqual(['headers']);
  });

  it('returns empty for strictly typed schemas', () => {
    const schema = z.object({
      severity: z.string(),
      nested: z.object({ id: z.string() }),
    });
    expect(extractOpenFieldPrefixesFromSchema(schema)).toEqual([]);
  });
});
