/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash/fp';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectedProps } from 'react-redux';
import { connect, useDispatch } from 'react-redux';
import deepEqual from 'fast-deep-equal';
import type { EuiDataGridControlColumn } from '@elastic/eui';
import { getEsQueryConfig } from '@kbn/data-plugin/common';
import { DataLoadingState } from '@kbn/unified-data-table';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { RunTimeMappings } from '@kbn/timelines-plugin/common/search_strategy';
import { useDataView } from '../../../../../data_view_manager/hooks/use_data_view';
import { useSelectedPatterns } from '../../../../../data_view_manager/hooks/use_selected_patterns';
import { useBrowserFields } from '../../../../../data_view_manager/hooks/use_browser_fields';
import { useFetchNotes } from '../../../../../notes/hooks/use_fetch_notes';
import {
  DocumentDetailsLeftPanelKey,
  DocumentDetailsRightPanelKey,
} from '../../../../../flyout/document_details/shared/constants/panel_keys';
import { LeftPanelNotesTab } from '../../../../../flyout/document_details/left';
import { useDeepEqualSelector } from '../../../../../common/hooks/use_selector';
import {
  useEnableExperimental,
  useIsExperimentalFeatureEnabled,
} from '../../../../../common/hooks/use_experimental_features';
import { useTimelineDataFilters } from '../../../../containers/use_timeline_data_filters';
import { InputsModelId } from '../../../../../common/store/inputs/constants';
import { useInvalidFilterQuery } from '../../../../../common/hooks/use_invalid_filter_query';
import { timelineActions, timelineSelectors } from '../../../../store';
import type { Direction } from '../../../../../../common/search_strategy';
import { useTimelineEvents } from '../../../../containers';
import { useKibana } from '../../../../../common/lib/kibana';
import { QueryTabHeader } from './header';
import { combineQueries } from '../../../../../common/lib/kuery';
import { TimelineRefetch } from '../../refetch_timeline';
import type { KueryFilterQueryKind } from '../../../../../../common/types/timeline';
import { TimelineId, TimelineTabs } from '../../../../../../common/types/timeline';
import type { inputsModel, State } from '../../../../../common/store';
import { inputsSelectors } from '../../../../../common/store';
import { SourcererScopeName } from '../../../../../sourcerer/store/model';
import { timelineDefaults } from '../../../../store/defaults';
import { useSourcererDataView } from '../../../../../sourcerer/containers';
import { isActiveTimeline } from '../../../../../helpers';
import type { TimelineModel } from '../../../../store/model';
import { UnifiedTimelineBody } from '../../body/unified_timeline_body';
import { isTimerangeSame } from '../shared/utils';
import type { TimelineTabCommonProps } from '../shared/types';
import { useTimelineColumns } from '../shared/use_timeline_columns';
import { useTimelineControlColumn } from '../shared/use_timeline_control_columns';
import { NotesFlyout } from '../../properties/notes_flyout';
import { useNotesInFlyout } from '../../properties/use_notes_in_flyout';
import { DocumentEventTypes, NotesEventTypes } from '../../../../../common/lib/telemetry';

const compareQueryProps = (prevProps: Props, nextProps: Props) =>
  prevProps.kqlMode === nextProps.kqlMode &&
  prevProps.kqlQueryExpression === nextProps.kqlQueryExpression &&
  deepEqual(prevProps.filters, nextProps.filters);

export type Props = TimelineTabCommonProps & PropsFromRedux;

export const QueryTabContentComponent: React.FC<Props> = ({
  activeTab,
  columns,
  dataProviders,
  end,
  filters,
  timelineId,
  itemsPerPage,
  itemsPerPageOptions,
  kqlMode,
  kqlQueryExpression,
  kqlQueryLanguage,
  rowRenderers,
  show,
  showCallOutUnauthorizedMsg,
  start,
  status,
  sort,
  timerangeKind,
  pinnedEventIds,
  eventIdToNoteIds,
}) => {
  const dispatch = useDispatch();
  const { newDataViewPickerEnabled } = useEnableExperimental();

  const { dataView: experimentalDataView, status: sourcererStatus } = useDataView(
    SourcererScopeName.timeline
  );
  const experimentalBrowserFields = useBrowserFields(SourcererScopeName.timeline);
  const experimentalSelectedPatterns = useSelectedPatterns(SourcererScopeName.timeline);

  const {
    browserFields: oldBrowserFields,
    dataViewId: oldDataViewId,
    loading: oldLoadingSourcerer,
    // important to get selectedPatterns from useSourcererDataView
    // in order to include the exclude filters in the search that are not stored in the timeline
    selectedPatterns: oldSelectedPatterns,
    sourcererDataView: oldSourcererDataViewSpec,
  } = useSourcererDataView(SourcererScopeName.timeline);

  const loadingSourcerer = useMemo(
    () => (newDataViewPickerEnabled ? sourcererStatus !== 'ready' : oldLoadingSourcerer),
    [newDataViewPickerEnabled, oldLoadingSourcerer, sourcererStatus]
  );
  const browserFields = useMemo(
    () => (newDataViewPickerEnabled ? experimentalBrowserFields : oldBrowserFields),
    [experimentalBrowserFields, newDataViewPickerEnabled, oldBrowserFields]
  );
  const selectedPatterns = useMemo(
    () => (newDataViewPickerEnabled ? experimentalSelectedPatterns : oldSelectedPatterns),
    [experimentalSelectedPatterns, newDataViewPickerEnabled, oldSelectedPatterns]
  );
  const dataViewId = useMemo(
    () => (newDataViewPickerEnabled ? experimentalDataView.id ?? '' : oldDataViewId),
    [experimentalDataView.id, newDataViewPickerEnabled, oldDataViewId]
  );

  /*
   * `pageIndex` needs to be maintained for each table in each tab independently
   * and consequently it cannot be the part of common redux state
   * of the timeline.
   *
   */
  const [pageIndex, setPageIndex] = useState(0);

  const { uiSettings, telemetry, timelineDataService } = useKibana().services;
  const {
    query: { filterManager: timelineFilterManager },
  } = timelineDataService;

  const getManageTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);

  const currentTimeline = useDeepEqualSelector((state) =>
    getManageTimeline(state, timelineId ?? TimelineId.active)
  );

  const { sampleSize } = currentTimeline;

  const esQueryConfig = useMemo(() => getEsQueryConfig(uiSettings), [uiSettings]);
  const kqlQuery: {
    query: string;
    language: KueryFilterQueryKind;
  } = useMemo(
    () => ({ query: kqlQueryExpression.trim(), language: kqlQueryLanguage }),
    [kqlQueryExpression, kqlQueryLanguage]
  );

  const runtimeMappings = useMemo(() => {
    return newDataViewPickerEnabled
      ? (experimentalDataView.getRuntimeMappings() as RunTimeMappings)
      : (oldSourcererDataViewSpec.runtimeFieldMap as RunTimeMappings);
  }, [newDataViewPickerEnabled, experimentalDataView, oldSourcererDataViewSpec.runtimeFieldMap]);

  const combinedQueries = useMemo(() => {
    return combineQueries({
      config: esQueryConfig,
      dataProviders,
      dataViewSpec: oldSourcererDataViewSpec,
      dataView: experimentalDataView,
      browserFields,
      filters,
      kqlQuery,
      kqlMode,
    });
  }, [
    esQueryConfig,
    dataProviders,
    oldSourcererDataViewSpec,
    experimentalDataView,
    browserFields,
    filters,
    kqlQuery,
    kqlMode,
  ]);

  useInvalidFilterQuery({
    id: timelineId,
    filterQuery: combinedQueries?.filterQuery,
    kqlError: combinedQueries?.kqlError,
    query: kqlQuery,
    startDate: start,
    endDate: end,
  });

  const isBlankTimeline: boolean =
    isEmpty(dataProviders) &&
    isEmpty(filters) &&
    isEmpty(kqlQuery.query) &&
    combinedQueries?.filterQuery === undefined;

  const canQueryTimeline = useMemo(
    () =>
      combinedQueries != null &&
      loadingSourcerer != null &&
      !loadingSourcerer &&
      !isEmpty(start) &&
      !isEmpty(end) &&
      combinedQueries?.filterQuery !== undefined,
    [combinedQueries, end, loadingSourcerer, start]
  );

  const timelineQuerySortField = useMemo(() => {
    return sort.map(({ columnId, columnType, esTypes, sortDirection }) => ({
      field: columnId,
      direction: sortDirection as Direction,
      esTypes: esTypes ?? [],
      type: columnType,
    }));
  }, [sort]);

  const { augmentedColumnHeaders, defaultColumns, timelineQueryFieldsFromColumns } =
    useTimelineColumns(columns);

  const [dataLoadingState, { events, inspect, totalCount, loadNextBatch, refreshedAt, refetch }] =
    useTimelineEvents({
      dataViewId: dataViewId ?? '',
      endDate: end,
      fields: timelineQueryFieldsFromColumns,
      filterQuery: combinedQueries?.filterQuery,
      id: timelineId,
      indexNames: selectedPatterns,
      language: kqlQuery.language,
      limit: sampleSize,
      runtimeMappings,
      skip: !canQueryTimeline,
      sort: timelineQuerySortField,
      startDate: start,
      timerangeKind,
    });

  const { onLoad: loadNotesOnEventsLoad } = useFetchNotes();

  useEffect(() => {
    // This useEffect loads the notes only for the events on the current
    // page.
    const eventsOnCurrentPage = events.slice(
      itemsPerPage * pageIndex,
      itemsPerPage * (pageIndex + 1)
    );
    if (eventsOnCurrentPage.length > 0) {
      loadNotesOnEventsLoad(eventsOnCurrentPage);
    }
  }, [events, pageIndex, itemsPerPage, loadNotesOnEventsLoad]);

  /**
   *
   * Triggers on Datagrid page change
   *
   */
  const onUpdatePageIndex = useCallback((newPageIndex: number) => setPageIndex(newPageIndex), []);

  const { openFlyout } = useExpandableFlyoutApi();
  const securitySolutionNotesDisabled = useIsExperimentalFeatureEnabled(
    'securitySolutionNotesDisabled'
  );

  const {
    associateNote,
    notes,
    isNotesFlyoutVisible,
    closeNotesFlyout,
    showNotesFlyout,
    eventId: noteEventId,
    setNotesEventId,
  } = useNotesInFlyout({
    eventIdToNoteIds,
    refetch,
    timelineId,
    activeTab,
  });

  const onToggleShowNotes = useCallback(
    (eventId?: string) => {
      const indexName = selectedPatterns.join(',');
      if (eventId && !securitySolutionNotesDisabled) {
        openFlyout({
          right: {
            id: DocumentDetailsRightPanelKey,
            params: {
              id: eventId,
              indexName,
              scopeId: timelineId,
            },
          },
          left: {
            id: DocumentDetailsLeftPanelKey,
            path: {
              tab: LeftPanelNotesTab,
            },
            params: {
              id: eventId,
              indexName,
              scopeId: timelineId,
            },
          },
        });
        telemetry.reportEvent(NotesEventTypes.OpenNoteInExpandableFlyoutClicked, {
          location: timelineId,
        });
        telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutOpened, {
          location: timelineId,
          panel: 'left',
        });
      } else {
        if (eventId) {
          setNotesEventId(eventId);
          showNotesFlyout();
        }
      }
    },
    [
      openFlyout,
      securitySolutionNotesDisabled,
      selectedPatterns,
      telemetry,
      timelineId,
      showNotesFlyout,
      setNotesEventId,
    ]
  );

  const leadingControlColumns = useTimelineControlColumn({
    timelineId,
    refetch,
    events,
    pinnedEventIds,
    eventIdToNoteIds,
    onToggleShowNotes,
  });

  useEffect(() => {
    dispatch(
      timelineActions.initializeTimelineSettings({
        id: timelineId,
        defaultColumns,
      })
    );
  }, [dispatch, timelineId, defaultColumns]);

  const isQueryLoading = useMemo(
    () => [DataLoadingState.loading, DataLoadingState.loadingMore].includes(dataLoadingState),
    [dataLoadingState]
  );

  // NOTE: The timeline is blank after browser FORWARD navigation (after using back button to navigate to
  // the previous page from the timeline), yet we still see total count. This is because the timeline
  // is not getting refreshed when using browser navigation.
  const showEventsCountBadge = !isBlankTimeline && totalCount >= 0;

  // <Synchronisation of the timeline data service>
  // Sync the timerange
  const timelineFilters = useTimelineDataFilters(isActiveTimeline(timelineId));
  useEffect(() => {
    timelineDataService.query.timefilter.timefilter.setTime({
      from: timelineFilters.from,
      to: timelineFilters.to,
    });
  }, [timelineDataService.query.timefilter.timefilter, timelineFilters.from, timelineFilters.to]);

  // Sync the base query
  useEffect(() => {
    timelineDataService.query.queryString.setQuery(
      // We're using the base query of all combined queries here, to account for all
      // of timeline's query dependencies (data providers, query etc.)
      combinedQueries?.baseKqlQuery || { language: kqlQueryLanguage, query: '' }
    );
  }, [timelineDataService, combinedQueries, kqlQueryLanguage]);
  // </Synchronisation of the timeline data service>

  const NotesFlyoutMemo = useMemo(() => {
    return (
      <NotesFlyout
        associateNote={associateNote}
        eventId={noteEventId}
        show={isNotesFlyoutVisible}
        notes={notes}
        onClose={closeNotesFlyout}
        onCancel={closeNotesFlyout}
        timelineId={timelineId}
      />
    );
  }, [associateNote, closeNotesFlyout, isNotesFlyoutVisible, noteEventId, notes, timelineId]);

  return (
    <>
      <TimelineRefetch
        id={`${timelineId}-${TimelineTabs.query}`}
        inputId={InputsModelId.timeline}
        inspect={inspect}
        loading={isQueryLoading}
        refetch={refetch}
        skip={!canQueryTimeline}
      />
      {NotesFlyoutMemo}

      <UnifiedTimelineBody
        header={
          <QueryTabHeader
            activeTab={activeTab}
            filterManager={timelineFilterManager}
            show={show && activeTab === TimelineTabs.query}
            showCallOutUnauthorizedMsg={showCallOutUnauthorizedMsg}
            status={status}
            timelineId={timelineId}
            showEventsCountBadge={showEventsCountBadge}
            totalCount={totalCount}
          />
        }
        columns={augmentedColumnHeaders}
        rowRenderers={rowRenderers}
        timelineId={timelineId}
        itemsPerPage={itemsPerPage}
        itemsPerPageOptions={itemsPerPageOptions}
        sort={sort}
        events={events}
        refetch={refetch}
        dataLoadingState={dataLoadingState}
        totalCount={isBlankTimeline ? 0 : totalCount}
        leadingControlColumns={leadingControlColumns as EuiDataGridControlColumn[]}
        onFetchMoreRecords={loadNextBatch}
        activeTab={activeTab}
        updatedAt={refreshedAt}
        isTextBasedQuery={false}
        onUpdatePageIndex={onUpdatePageIndex}
      />
    </>
  );
};

const makeMapStateToProps = () => {
  const getShowCallOutUnauthorizedMsg = timelineSelectors.getShowCallOutUnauthorizedMsg();
  const getTimeline = timelineSelectors.getTimelineByIdSelector();
  const getKqlQueryTimeline = timelineSelectors.getKqlFilterKuerySelector();
  const getInputsTimeline = inputsSelectors.getTimelineSelector();
  const mapStateToProps = (state: State, { timelineId }: TimelineTabCommonProps) => {
    const timeline: TimelineModel = getTimeline(state, timelineId) ?? timelineDefaults;
    const input: inputsModel.InputsRange = getInputsTimeline(state);
    const {
      activeTab,
      columns,
      dataProviders,
      pinnedEventIds,
      eventIdToNoteIds,
      filters,
      itemsPerPage,
      itemsPerPageOptions,
      kqlMode,
      show,
      sort,
      status,
      timelineType,
    } = timeline;

    const kqlQueryTimeline = getKqlQueryTimeline(state, timelineId);
    const timelineFilter = kqlMode === 'filter' ? filters || [] : [];

    // return events on empty search
    const kqlQueryExpression =
      isEmpty(dataProviders) &&
      isEmpty(kqlQueryTimeline?.expression ?? '') &&
      timelineType === 'template'
        ? ' '
        : kqlQueryTimeline?.expression ?? '';

    const kqlQueryLanguage =
      isEmpty(dataProviders) && timelineType === 'template'
        ? 'kuery'
        : kqlQueryTimeline?.kind ?? 'kuery';

    return {
      activeTab,
      columns,
      dataProviders,
      end: input.timerange.to,
      filters: timelineFilter,
      timelineId,
      pinnedEventIds,
      eventIdToNoteIds,
      itemsPerPage,
      itemsPerPageOptions,
      kqlMode,
      kqlQueryExpression,
      kqlQueryLanguage,
      showCallOutUnauthorizedMsg: getShowCallOutUnauthorizedMsg(state),
      show,
      sort,
      start: input.timerange.from,
      status,
      timerangeKind: input.timerange.kind,
    };
  };
  return mapStateToProps;
};

const connector = connect(makeMapStateToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

const QueryTabContent = connector(
  React.memo(
    QueryTabContentComponent,
    (prevProps, nextProps) =>
      compareQueryProps(prevProps, nextProps) &&
      prevProps.activeTab === nextProps.activeTab &&
      isTimerangeSame(prevProps, nextProps) &&
      prevProps.itemsPerPage === nextProps.itemsPerPage &&
      prevProps.show === nextProps.show &&
      prevProps.showCallOutUnauthorizedMsg === nextProps.showCallOutUnauthorizedMsg &&
      prevProps.status === nextProps.status &&
      prevProps.status === nextProps.status &&
      prevProps.timelineId === nextProps.timelineId &&
      deepEqual(prevProps.eventIdToNoteIds, nextProps.eventIdToNoteIds) &&
      deepEqual(prevProps.columns, nextProps.columns) &&
      deepEqual(prevProps.pinnedEventIds, nextProps.pinnedEventIds) &&
      deepEqual(prevProps.dataProviders, nextProps.dataProviders) &&
      deepEqual(prevProps.itemsPerPageOptions, nextProps.itemsPerPageOptions) &&
      deepEqual(prevProps.sort, nextProps.sort)
  )
);

// eslint-disable-next-line import/no-default-export
export { QueryTabContent as default };
