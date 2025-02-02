/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IMetricsExplorerViewsClient } from './types';

export const createMetricsExplorerViewsClientMock =
  (): jest.Mocked<IMetricsExplorerViewsClient> => ({
    findMetricsExplorerViews: jest.fn(),
    getMetricsExplorerView: jest.fn(),
    createMetricsExplorerView: jest.fn(),
    updateMetricsExplorerView: jest.fn(),
    deleteMetricsExplorerView: jest.fn(),
  });
