/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldSpec } from '@kbn/data-plugin/common';

/**
 * Filters out fields, that are not supported in terms aggregation.
 * Terms aggregation supports limited number of types:
 * Keyword, Numeric, ip, boolean, or binary.
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-terms-aggregation.html
 */
export const getTermsAggregationFields = (fields: FieldSpec[]): FieldSpec[] =>
  fields.filter(
    (field) => field.aggregatable === true && ALLOWED_AGGREGATABLE_FIELD_TYPES_SET.has(field.type)
  );

// binary types is excluded, as binary field has property aggregatable === false
const ALLOWED_AGGREGATABLE_FIELD_TYPES_SET = new Set(['string', 'number', 'ip', 'boolean']);
