/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'host',
  'proxy-authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-inbound-query',
]);

export const filterInboundHeaders = (
  headers: Record<string, string | string[] | undefined>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) => {
      const normalizedName = name.toLowerCase();
      if (
        SENSITIVE_HEADERS.has(normalizedName) ||
        (!normalizedName.startsWith('x-') &&
          normalizedName !== 'content-type' &&
          normalizedName !== 'user-agent')
      ) {
        return [];
      }
      const normalizedValue = Array.isArray(value) ? value.join(',') : value;
      return typeof normalizedValue === 'string' ? [[normalizedName, normalizedValue]] : [];
    })
  );
