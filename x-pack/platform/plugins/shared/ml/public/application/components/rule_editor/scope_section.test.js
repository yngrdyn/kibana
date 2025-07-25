/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Mock the mlJobService that is imported for saving rules.
jest.mock('../../services/job_service', () => 'mlJobService');

// Create a mock for the canGetFilters privilege check.
// The mock is hoisted to the top, so need to prefix the mock function
// with 'mock' so it can be used lazily.
const mockCheckPermission = jest.fn(() => true);
jest.mock('../../capabilities/check_capabilities', () => ({
  checkPermission: (privilege) => mockCheckPermission(privilege),
}));

jest.mock('../../contexts/kibana', () => ({
  useCreateAndNavigateToManagementMlLink: jest.fn().mockReturnValue(jest.fn()),
}));

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { ML_DETECTOR_RULE_FILTER_TYPE } from '@kbn/ml-anomaly-utils';

import { ScopeSection } from './scope_section';

describe('ScopeSection', () => {
  const testFilterListIds = ['web_domains', 'safe_domains', 'uk_domains'];

  const testScope = {
    domain: {
      filter_id: 'uk_domains',
      filter_type: ML_DETECTOR_RULE_FILTER_TYPE.INCLUDE,
      enabled: true,
    },
  };

  const onEnabledChange = jest.fn();
  const updateScope = jest.fn();

  const requiredProps = {
    filterListIds: testFilterListIds,
    onEnabledChange,
    updateScope,
  };

  test('renders when not enabled', () => {
    const props = {
      ...requiredProps,
      partitioningFieldNames: ['domain'],
      isEnabled: false,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });

  test(`don't render when no partitioning fields`, () => {
    const props = {
      ...requiredProps,
      partitioningFieldNames: [],
      isEnabled: false,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('show NoFilterListsCallOut when no filter list IDs', () => {
    const props = {
      ...requiredProps,
      partitioningFieldNames: ['domain'],
      filterListIds: [],
      isEnabled: true,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('renders when enabled with no scope supplied', () => {
    const props = {
      ...requiredProps,
      partitioningFieldNames: ['domain'],
      isEnabled: true,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });

  test('renders when enabled with scope supplied', () => {
    const props = {
      ...requiredProps,
      partitioningFieldNames: ['domain'],
      scope: testScope,
      isEnabled: true,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });
});

describe('ScopeSection false canGetFilters privilege', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  const onEnabledChange = jest.fn();
  const updateScope = jest.fn();

  const requiredProps = {
    onEnabledChange,
    updateScope,
  };

  test('show NoPermissionCallOut when no filter list IDs', () => {
    mockCheckPermission.mockImplementationOnce(() => {
      return false;
    });

    const props = {
      ...requiredProps,
      partitioningFieldNames: ['domain'],
      filterListIds: [],
      isEnabled: true,
    };

    const { container } = renderWithI18n(<ScopeSection {...props} />);

    expect(container).toMatchSnapshot();
  });
});
