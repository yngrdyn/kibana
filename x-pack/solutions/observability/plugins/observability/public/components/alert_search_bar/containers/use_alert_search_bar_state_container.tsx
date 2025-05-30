/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isRight } from 'fp-ts/Either';
import { pipe } from 'fp-ts/pipeable';
import * as t from 'io-ts';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { DEFAULT_CONTROLS } from '@kbn/alerts-ui-shared/src/alert_filter_controls/constants';
import {
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_RECOVERED,
  ALERT_STATUS_UNTRACKED,
} from '@kbn/rule-data-utils';
import { SavedQuery, TimefilterContract } from '@kbn/data-plugin/public';
import {
  createKbnUrlStateStorage,
  syncState,
  IKbnUrlStateStorage,
  useContainerSelector,
} from '@kbn/kibana-utils-plugin/public';
import { setStatusOnControlConfigs } from '../../../utils/alert_controls/set_status_on_control_configs';
import { datemathStringRT } from '../../../utils/datemath';
import { ALERT_STATUS_ALL } from '../../../../common/constants';
import { useTimefilterService } from '../../../hooks/use_timefilter_service';

import {
  useContainer,
  DEFAULT_STATE,
  AlertSearchBarStateContainer,
  AlertSearchBarContainerState,
} from './state_container';

export const alertSearchBarState = t.partial({
  rangeFrom: datemathStringRT,
  rangeTo: datemathStringRT,
  kuery: t.string,
  status: t.union([
    t.literal(ALERT_STATUS_ACTIVE),
    t.literal(ALERT_STATUS_RECOVERED),
    t.literal(ALERT_STATUS_ALL),
    t.literal(ALERT_STATUS_UNTRACKED),
  ]),
  groupings: t.array(t.string),
});

export function useAlertSearchBarStateContainer(
  urlStorageKey: string,
  { replace }: { replace?: boolean } = {},
  defaultState: AlertSearchBarContainerState = DEFAULT_STATE
) {
  const [savedQuery, setSavedQuery] = useState<SavedQuery>();
  const stateContainer = useContainer();

  useUrlStateSyncEffect(stateContainer, urlStorageKey, replace, defaultState);

  const {
    setRangeFrom,
    setRangeTo,
    setKuery,
    setStatus,
    setFilters,
    setSavedQueryId,
    setControlConfigs,
    setGroupings,
  } = stateContainer.transitions;
  const { rangeFrom, rangeTo, kuery, status, filters, savedQueryId, controlConfigs, groupings } =
    useContainerSelector(stateContainer, (state) => state);

  useEffect(() => {
    if (!savedQuery) {
      setSavedQueryId(undefined);
      return;
    }
    if (savedQuery.id !== savedQueryId) {
      setSavedQueryId(savedQuery.id);
      if (typeof savedQuery.attributes.query.query === 'string') {
        setKuery(savedQuery.attributes.query.query);
      }
      if (savedQuery.attributes.filters?.length) {
        setFilters(savedQuery.attributes.filters);
      }
      if (savedQuery.attributes.timefilter?.from) {
        setRangeFrom(savedQuery.attributes.timefilter.from);
      }
      if (savedQuery.attributes.timefilter?.to) {
        setRangeFrom(savedQuery.attributes.timefilter.to);
      }
    }
  }, [
    savedQuery,
    savedQueryId,
    setFilters,
    setKuery,
    setRangeFrom,
    setSavedQueryId,
    stateContainer,
  ]);

  return {
    kuery,
    onKueryChange: setKuery,
    onRangeFromChange: setRangeFrom,
    onRangeToChange: setRangeTo,
    onStatusChange: setStatus,
    onFiltersChange: setFilters,
    onControlConfigsChange: setControlConfigs,
    onGroupingsChange: setGroupings,
    controlConfigs,
    filters,
    rangeFrom,
    rangeTo,
    status,
    savedQuery,
    setSavedQuery,
    groupings,
  };
}

function useUrlStateSyncEffect(
  stateContainer: AlertSearchBarStateContainer,
  urlStorageKey: string,
  replace: boolean = true,
  defaultState: AlertSearchBarContainerState = DEFAULT_STATE
) {
  const history = useHistory();
  const timefilterService = useTimefilterService();

  useEffect(() => {
    const urlStateStorage = createKbnUrlStateStorage({
      history,
      useHash: false,
      useHashQuery: false,
    });
    const { start, stop } = setupUrlStateSync(
      stateContainer,
      urlStateStorage,
      urlStorageKey,
      replace
    );

    initializeUrlAndStateContainer(
      timefilterService,
      stateContainer,
      urlStateStorage,
      urlStorageKey,
      defaultState
    );

    start();

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateContainer, history, timefilterService, urlStorageKey, replace]);
}

function setupUrlStateSync(
  stateContainer: AlertSearchBarStateContainer,
  urlStateStorage: IKbnUrlStateStorage,
  urlStorageKey: string,
  replace: boolean = true,
  defaultState: AlertSearchBarContainerState = DEFAULT_STATE
) {
  // This handles filling the state when an incomplete URL set is provided
  const setWithDefaults = (changedState: Partial<AlertSearchBarContainerState> | null) => {
    stateContainer.set({ ...defaultState, ...changedState });
  };

  return syncState({
    storageKey: urlStorageKey,
    stateContainer: {
      ...stateContainer,
      set: setWithDefaults,
    },
    stateStorage: {
      ...urlStateStorage,
      set: <AlertSearchBarStateContainer,>(key: string, state: AlertSearchBarStateContainer) =>
        urlStateStorage.set(key, state, { replace }),
    },
  });
}

function initializeUrlAndStateContainer(
  timefilterService: TimefilterContract,
  stateContainer: AlertSearchBarStateContainer,
  urlStateStorage: IKbnUrlStateStorage,
  urlStorageKey: string,
  defaultState: AlertSearchBarContainerState
) {
  const urlState = alertSearchBarState.decode(
    urlStateStorage.get<Partial<AlertSearchBarContainerState>>(urlStorageKey)
  );
  const validUrlState: Partial<AlertSearchBarContainerState> = isRight(urlState)
    ? pipe(urlState).right
    : {};
  const timeFilterTime = timefilterService.getTime();
  const timeFilterState = timefilterService.isTimeTouched()
    ? {
        rangeFrom: timeFilterTime.from,
        rangeTo: timeFilterTime.to,
      }
    : {};

  // This part is for backward compatibility. Previously, we saved status in the status query
  // parameter. Now, we save it in the controlConfigs.
  if (validUrlState.status) {
    validUrlState.controlConfigs = setStatusOnControlConfigs(
      validUrlState.status,
      validUrlState.controlConfigs ?? DEFAULT_CONTROLS
    );
    validUrlState.status = undefined;
  }

  const currentState = {
    ...defaultState,
    ...timeFilterState,
    ...validUrlState,
  };

  stateContainer.set(currentState);
  urlStateStorage.set(urlStorageKey, currentState, {
    replace: true,
  });
  urlStateStorage.kbnUrlControls.flush();
}
