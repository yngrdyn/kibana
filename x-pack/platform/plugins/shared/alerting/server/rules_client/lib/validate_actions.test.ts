/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ValidateActionsData } from './validate_actions';
import { validateActions } from './validate_actions';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { AlertsFilter, RuleAction } from '../../../common';
import { RecoveredActionGroup, RuleNotifyWhen } from '../../../common';
import type { NormalizedAlertAction, NormalizedSystemAction, RulesClientContext } from '..';

describe('validateActions', () => {
  const loggerErrorMock = jest.fn();
  const getBulkMock = jest.fn();
  const listTypesMock = jest.fn();
  const ruleType: jest.Mocked<UntypedNormalizedRuleType> = {
    id: 'test',
    name: 'My test rule',
    actionGroups: [{ id: 'default', name: 'Default' }, RecoveredActionGroup],
    defaultActionGroupId: 'default',
    minimumLicenseRequired: 'basic',
    isExportable: true,
    recoveryActionGroup: RecoveredActionGroup,
    executor: jest.fn(),
    producer: 'alerts',
    cancelAlertsOnRuleTimeout: true,
    ruleTaskTimeout: '5m',
    validate: {
      params: { validate: (params) => params },
    },
    alerts: {
      context: 'context',
      mappings: { fieldMap: { field: { type: 'fieldType', required: false } } },
    },
    category: 'test',
    validLegacyConsumers: [],
  };

  const defaultAction: NormalizedAlertAction = {
    uuid: '111',
    group: 'default',
    id: '1',
    params: {},
    frequency: {
      summary: false,
      notifyWhen: RuleNotifyWhen.ACTIVE,
      throttle: null,
    },
    alertsFilter: {
      query: { kql: 'test:1', filters: [] },
      timeframe: { days: [1], hours: { start: '10:00', end: '17:00' }, timezone: 'UTC' },
    },
  };

  const systemAction: NormalizedSystemAction = {
    uuid: '111',
    id: '1',
    params: {},
  };

  const data = {
    schedule: { interval: '1m' },
    actions: [defaultAction],
  } as unknown as ValidateActionsData;

  const context = {
    logger: { error: loggerErrorMock },
    getActionsClient: () => {
      return {
        getBulk: getBulkMock,
        listTypes: listTypesMock,
      };
    },
  };

  beforeEach(() => {
    listTypesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return error message if actions have duplicated uuid', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            ...data.actions,
            {
              ...data.actions[0],
            },
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Actions have duplicated UUIDs"'
    );
  });

  it('should return error message if actions have duplicated uuid and there is a system action', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [defaultAction],
          systemActions: [systemAction],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Actions have duplicated UUIDs"'
    );
  });

  it('should return error message if any action have isMissingSecrets', async () => {
    getBulkMock.mockResolvedValue([{ isMissingSecrets: true, name: 'test name' }]);
    await expect(
      validateActions(context as unknown as RulesClientContext, ruleType, data, false)
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Invalid connectors: test name"'
    );
  });

  it('should return error message if any action have invalidActionGroups', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        { ...data, actions: [{ ...data.actions[0], group: 'invalid' } as RuleAction] },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Invalid action groups: invalid"'
    );
  });

  it('should return error message if any action have frequency when there is rule level notify_when', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        { ...data, notifyWhen: 'onActiveAlert' },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default"'
    );
  });

  it('should return error message if any action have frequency when there is rule level throttle', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        { ...data, throttle: '1h' },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default"'
    );
  });

  it('should return error message if any action does not have frequency', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        { ...data, actions: [{ ...data.actions[0], frequency: undefined } as RuleAction] },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Actions missing frequency parameters: default"'
    );
  });

  it('should return error message if any action have invalid throttle', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            {
              ...data.actions[0],
              frequency: { summary: false, notifyWhen: 'onThrottleInterval', throttle: '1s' },
            } as RuleAction,
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Action frequency cannot be shorter than the schedule interval of 1m: default (1s)"'
    );
  });

  it('should return error message if any action has alertsFilter but has neither query not timeframe in it', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            {
              ...data.actions[0],
              alertsFilter: {} as AlertsFilter,
            } as RuleAction,
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Action\'s alertsFilter  must have either \\"query\\" or \\"timeframe\\" : 111"'
    );
  });

  it('should return error message if any action has an invalid time range', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            {
              ...data.actions[0],
              alertsFilter: {
                query: { kql: 'test:1', filters: [] },
                timeframe: { days: [1], hours: { start: '30:00', end: '17:00' }, timezone: 'UTC' },
              },
            } as NormalizedAlertAction,
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Action\'s alertsFilter time range has an invalid value: 30:00-17:00"'
    );
  });

  it('should return error message if any action has alertsFilter but the rule type does not have alerts mapping', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        { ...ruleType, alerts: undefined },
        data,
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: This ruleType (My test rule) can\'t have an action with Alerts Filter. Actions: [111]"'
    );
  });

  it('should return error message if any action has alertsFilter timeframe has missing field', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            {
              ...data.actions[0],
              alertsFilter: {
                query: { kql: 'test:1', filters: [] },
                // @ts-ignore
                timeframe: { days: [1], hours: { start: '10:00', end: '17:00' } },
              },
            },
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Action\'s alertsFilter timeframe has missing fields: days, hours or timezone: 111"'
    );
  });

  it('should return error message if any action has alertsFilter timeframe has invalid days', async () => {
    await expect(
      validateActions(
        context as unknown as RulesClientContext,
        ruleType,
        {
          ...data,
          actions: [
            {
              ...data.actions[0],
              alertsFilter: {
                query: { kql: 'test:1', filters: [] },
                timeframe: {
                  // @ts-ignore
                  days: [0, 8],
                  hours: { start: '10:00', end: '17:00' },
                  timezone: 'UTC',
                },
              },
            },
          ],
        },
        false
      )
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Action\'s alertsFilter days has invalid values: (111:[0,8]) "'
    );
  });

  it('should return error message if the action is an Endpoint Security sub-feature connector type', async () => {
    getBulkMock.mockResolvedValueOnce([
      { actionTypeId: 'test.endpointSecurity', name: 'test name' },
    ]);
    listTypesMock.mockResolvedValueOnce([
      {
        id: 'test.endpointSecurity',
        name: 'endpoint security connector type',
        subFeature: 'endpointSecurity',
      },
    ]);
    await expect(
      validateActions(context as unknown as RulesClientContext, ruleType, data, false)
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Failed to validate actions due to the following error: Endpoint security connectors cannot be used as alerting actions"'
    );
  });
});
