/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Name of the datastream in elasticsearch
 */
export const DATA_STREAM_NAME = '.kibana_change_history';
/**
 * Separator char. Used for scoping.
 */
export const SEPARATOR_CHAR = '|';
/**
 * The version of ECS used
 * @see https://www.elastic.co/docs/reference/ecs/ecs-field-reference
 */
export const ECS_VERSION = '9.3.0';
/**
 * The default size of results when getting history.
 */
export const DEFAULT_RESULT_SIZE = 100;

/**
 * Acts like a feature flag for this package as it prevents initialization.
 *
 * Temporarily disabled for incident-3371: `.kibana_change_history` was not
 * registered as a SystemDataStream, so backing indices are readable across
 * spaces. Re-enable after the Elasticsearch SystemDataStream fix ships.
 * @see https://github.com/elastic/security-team/issues/18291
 */
export const FLAGS = {
  FEATURE_ENABLED: false,
};
