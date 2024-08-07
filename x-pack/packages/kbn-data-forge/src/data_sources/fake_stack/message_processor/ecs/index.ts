/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MESSAGE_PROCESSOR } from '../../common/constants';
import template from './generated/elasticsearch/composable/template.json';
import base from './generated/elasticsearch/composable/component/base.json';
import log from './generated/elasticsearch/composable/component/log.json';
import host from './generated/elasticsearch/composable/component/host.json';
import processor from './generated/elasticsearch/composable/component/processor.json';
import { IndexTemplateDef } from '../../../../types';

const ECS_VERSION = template._meta.ecs_version;

const components = [
  { name: `${MESSAGE_PROCESSOR}_${ECS_VERSION}_base`, template: base },
  { name: `${MESSAGE_PROCESSOR}_${ECS_VERSION}_log`, template: log },
  { name: `${MESSAGE_PROCESSOR}_${ECS_VERSION}_host`, template: host },
  { name: `${MESSAGE_PROCESSOR}_${ECS_VERSION}_processor`, template: processor },
];

export const indexTemplate: IndexTemplateDef = {
  name: `logs-${MESSAGE_PROCESSOR}@template`,
  template: { ...template, composed_of: components.map(({ name }) => name) },
  components,
};
