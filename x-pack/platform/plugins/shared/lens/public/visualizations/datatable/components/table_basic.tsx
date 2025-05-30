/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ColorMappingInputData, PaletteOutput, getFallbackDataBounds } from '@kbn/coloring';
import React, {
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useContext,
  useEffect,
} from 'react';
import { i18n } from '@kbn/i18n';
import useDeepCompareEffect from 'react-use/lib/useDeepCompareEffect';
import {
  EuiButtonIcon,
  EuiDataGrid,
  EuiDataGridRefProps,
  EuiDataGridControlColumn,
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiDataGridStyle,
} from '@elastic/eui';
import { CustomPaletteState, EmptyPlaceholder } from '@kbn/charts-plugin/public';
import { ClickTriggerEvent } from '@kbn/charts-plugin/public';
import { IconChartDatatable } from '@kbn/chart-icons';
import { getOriginalId } from '@kbn/transpose-utils';
import { useKbnPalettes } from '@kbn/palettes';
import type { IFieldFormat } from '@kbn/field-formats-plugin/common';
import { getColorCategories, getLegacyColorCategories } from '@kbn/chart-expressions-common';
import { css } from '@emotion/react';
import { DATA_GRID_DENSITY_STYLE_MAP } from '@kbn/unified-data-table/src/hooks/use_data_grid_density';
import { DATA_GRID_STYLE_NORMAL } from '@kbn/unified-data-table/src/constants';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme/hooks';
import type { LensTableRowContextMenuEvent } from '../../../types';
import { RowHeightMode } from '../../../../common/types';
import { LensGridDirection } from '../../../../common/expressions';
import { findMinMaxByColumnId, shouldColorByTerms } from '../../../shared_components';
import type {
  DataContextType,
  DatatableRenderProps,
  LensSortAction,
  LensResizeAction,
  LensToggleAction,
  LensPagesizeAction,
} from './types';
import { createGridColumns } from './columns';
import { createGridCell } from './cell_value';
import {
  buildSchemaDetectors,
  createGridFilterHandler,
  createGridHideHandler,
  createGridResizeHandler,
  createGridSortingConfig,
  createTransposeColumnFilterHandler,
} from './table_actions';
import { getFinalSummaryConfiguration } from '../../../../common/expressions/impl/datatable/summary';
import { DEFAULT_HEADER_ROW_HEIGHT, DEFAULT_HEADER_ROW_HEIGHT_LINES } from './constants';
import {
  getDatatableColumn,
  isNumericField,
} from '../../../../common/expressions/impl/datatable/utils';
import { CellColorFn, getCellColorFn } from '../../../shared_components/coloring/get_cell_color_fn';
import { getColumnAlignment } from '../utils';

export const DataContext = React.createContext<DataContextType>({});

const DATA_GRID_STYLE_DEFAULT: EuiDataGridStyle = {
  border: 'horizontal',
  header: 'shade',
  footer: 'shade',
};

export const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 20, 30, 50, 100];

export const DatatableComponent = (props: DatatableRenderProps) => {
  const dataGridRef = useRef<EuiDataGridRefProps>(null);

  const isInteractive = props.interactive;
  const isDarkMode = useKibanaIsDarkMode();
  const palettes = useKbnPalettes();

  const [columnConfig, setColumnConfig] = useState({
    columns: props.args.columns,
    sortingColumnId: props.args.sortingColumnId,
    sortingDirection: props.args.sortingDirection,
  });
  const [firstLocalTable, updateTable] = useState(props.data);

  // ** Pagination config
  const [pagination, setPagination] = useState<{ pageIndex: number; pageSize: number } | undefined>(
    undefined
  );

  useLayoutEffect(() => {
    // Temporary solution: DataGrid should provide onRender callback
    setTimeout(() => {
      props.renderComplete();
    }, 300);
  }, [props]);

  useEffect(() => {
    setPagination(
      props.args.pageSize
        ? {
            pageIndex: 0,
            pageSize: props.args.pageSize ?? DEFAULT_PAGE_SIZE,
          }
        : undefined
    );
  }, [props.args.pageSize]);

  useDeepCompareEffect(() => {
    setColumnConfig({
      columns: props.args.columns,
      sortingColumnId: props.args.sortingColumnId,
      sortingDirection: props.args.sortingDirection,
    });
  }, [props.args.columns, props.args.sortingColumnId, props.args.sortingDirection]);

  useDeepCompareEffect(() => {
    updateTable(props.data);
  }, [props.data]);

  const firstTableRef = useRef(firstLocalTable);
  firstTableRef.current = firstLocalTable;

  useEffect(() => {
    if (!pagination?.pageIndex && !pagination?.pageSize) return;
    const lastPageIndex = firstLocalTable.rows.length
      ? Math.ceil(firstLocalTable.rows.length / pagination.pageSize) - 1
      : 0;
    /**
     * When the underlying data changes, there might be a case when actual pagination page
     * doesn't exist anymore - if the number of rows has decreased.
     * Set the last page as an actual.
     */
    setPagination((pag) => {
      if (!pag) {
        return pag;
      }
      return {
        pageIndex: pag.pageIndex > lastPageIndex ? lastPageIndex : pag.pageIndex,
        pageSize: pag.pageSize,
      };
    });
  }, [pagination?.pageIndex, pagination?.pageSize, firstLocalTable.rows.length]);

  const untransposedDataRef = useRef(props.untransposedData);
  untransposedDataRef.current = props.untransposedData;

  const hasAtLeastOneRowClickAction = props.rowHasRowClickTriggerActions?.some((x) => x);

  const { getType, dispatchEvent, renderMode, formatFactory, syncColors } = props;

  const formatters: Record<string, IFieldFormat> = useMemo(
    () =>
      firstLocalTable.columns.reduce(
        (map, column) => ({
          ...map,
          [column.id]: formatFactory(column.meta?.params),
        }),
        {}
      ),
    [firstLocalTable, formatFactory]
  );

  const onClickValue = useCallback(
    (data: ClickTriggerEvent['data']) => {
      dispatchEvent({ name: 'filter', data });
    },
    [dispatchEvent]
  );

  const onEditAction = useCallback(
    (
      data:
        | LensSortAction['data']
        | LensResizeAction['data']
        | LensToggleAction['data']
        | LensPagesizeAction['data']
    ) => {
      dispatchEvent({ name: 'edit', data });
    },
    [dispatchEvent]
  );

  const onChangeItemsPerPage = useCallback(
    (pageSize: number) => onEditAction({ action: 'pagesize', size: pageSize }),
    [onEditAction]
  );

  // active page isn't persisted, so we manage this state locally
  const onChangePage = useCallback(
    (pageIndex: number) => {
      setPagination((_pagination) => {
        if (_pagination) {
          return { pageSize: _pagination?.pageSize, pageIndex };
        }
      });
    },
    [setPagination]
  );

  const onRowContextMenuClick = useCallback(
    (data: LensTableRowContextMenuEvent['data']) => {
      dispatchEvent({ name: 'tableRowContextMenuClick', data });
    },
    [dispatchEvent]
  );

  const handleFilterClick = useMemo(
    () => (isInteractive ? createGridFilterHandler(firstTableRef, onClickValue) : undefined),
    [firstTableRef, onClickValue, isInteractive]
  );

  const columnCellValueActions = useMemo(
    () => (isInteractive ? props.columnCellValueActions : undefined),
    [props.columnCellValueActions, isInteractive]
  );

  const handleTransposedColumnClick = useMemo(
    () =>
      isInteractive
        ? createTransposeColumnFilterHandler(onClickValue, untransposedDataRef)
        : undefined,
    [onClickValue, untransposedDataRef, isInteractive]
  );

  const bucketedColumns = useMemo(
    () =>
      columnConfig.columns
        .filter((_col, index) => {
          const col = firstTableRef.current.columns[index];
          return getType(col?.meta)?.type === 'buckets';
        })
        .map((col) => col.columnId),
    [firstTableRef, columnConfig, getType]
  );

  const isEmpty =
    firstLocalTable.rows.length === 0 ||
    (bucketedColumns.length > 0 &&
      props.data.rows.every((row) => bucketedColumns.every((col) => row[col] == null)));

  const visibleColumns = useMemo(
    () =>
      columnConfig.columns
        .filter((col) => !!col.columnId && !col.hidden)
        .map((col) => col.columnId),
    [columnConfig]
  );

  const isReadOnlySorted = renderMode !== 'edit';

  const onColumnResize = useMemo(
    () => createGridResizeHandler(columnConfig, setColumnConfig, onEditAction),
    [onEditAction, setColumnConfig, columnConfig]
  );

  const onColumnHide = useMemo(
    () =>
      isInteractive
        ? createGridHideHandler(columnConfig, setColumnConfig, onEditAction)
        : undefined,
    [onEditAction, setColumnConfig, columnConfig, isInteractive]
  );

  const isNumericMap: Map<string, boolean> = useMemo(
    () =>
      firstLocalTable.columns.reduce((acc, column) => {
        acc.set(column.id, isNumericField(column.meta));
        return acc;
      }, new Map<string, boolean>()),
    [firstLocalTable.columns]
  );

  const alignments: Map<string, 'left' | 'right' | 'center'> = useMemo(() => {
    return columnConfig.columns.reduce((acc, column) => {
      acc.set(column.columnId, getColumnAlignment(column, isNumericMap.get(column.columnId)));
      return acc;
    }, new Map<string, 'left' | 'right' | 'center'>());
  }, [columnConfig.columns, isNumericMap]);

  const minMaxByColumnId: Map<string, { min: number; max: number }> = useMemo(() => {
    return findMinMaxByColumnId(
      columnConfig.columns
        .filter(({ columnId }) => isNumericMap.get(columnId))
        .map(({ columnId }) => columnId),
      props.data
    );
  }, [props.data, isNumericMap, columnConfig]);

  const headerRowHeight = props.args.headerRowHeight ?? DEFAULT_HEADER_ROW_HEIGHT;
  const headerRowLines = props.args.headerRowHeightLines ?? DEFAULT_HEADER_ROW_HEIGHT_LINES;

  const columns: EuiDataGridColumn[] = useMemo(
    () =>
      createGridColumns(
        bucketedColumns,
        firstLocalTable,
        handleFilterClick,
        handleTransposedColumnClick,
        isReadOnlySorted,
        columnConfig,
        visibleColumns,
        formatFactory,
        onColumnResize,
        onColumnHide,
        alignments,
        headerRowHeight,
        headerRowLines,
        columnCellValueActions,
        dataGridRef.current?.closeCellPopover,
        props.columnFilterable
      ),
    [
      bucketedColumns,
      firstLocalTable,
      handleFilterClick,
      handleTransposedColumnClick,
      isReadOnlySorted,
      columnConfig,
      visibleColumns,
      formatFactory,
      onColumnResize,
      onColumnHide,
      alignments,
      headerRowHeight,
      headerRowLines,
      columnCellValueActions,
      props.columnFilterable,
    ]
  );

  const schemaDetectors = useMemo(
    () => buildSchemaDetectors(columns, columnConfig, firstLocalTable, formatters),
    [columns, firstLocalTable, columnConfig, formatters]
  );

  const trailingControlColumns: EuiDataGridControlColumn[] = useMemo(() => {
    if (!hasAtLeastOneRowClickAction || !onRowContextMenuClick || !isInteractive) {
      return [];
    }
    return [
      {
        headerCellRender: () => null,
        width: 40,
        id: 'trailingControlColumn',
        rowCellRender: function RowCellRender({ rowIndex }) {
          const { rowHasRowClickTriggerActions } = useContext(DataContext);
          return (
            <EuiButtonIcon
              aria-label={i18n.translate('xpack.lens.table.actionsLabel', {
                defaultMessage: 'Show actions',
              })}
              iconType={
                !!rowHasRowClickTriggerActions && !rowHasRowClickTriggerActions[rowIndex]
                  ? 'empty'
                  : 'boxesVertical'
              }
              color="text"
              onClick={() => {
                onRowContextMenuClick({
                  rowIndex,
                  table: firstTableRef.current,
                  columns: columnConfig.columns.map((col) => col.columnId),
                });
              }}
            />
          );
        },
      },
    ];
  }, [
    firstTableRef,
    onRowContextMenuClick,
    columnConfig,
    hasAtLeastOneRowClickAction,
    isInteractive,
  ]);

  const renderCellValue = useMemo(() => {
    const cellColorFnMap = new Map<string, CellColorFn>();
    const getCellColor = (
      columnId: string,
      palette?: PaletteOutput<CustomPaletteState>,
      colorMapping?: string
    ): CellColorFn => {
      const originalId = getOriginalId(columnId); // workout what bucket the value belongs to

      if (cellColorFnMap.has(originalId)) {
        return cellColorFnMap.get(originalId)!;
      }

      const colInfo = getDatatableColumn(firstLocalTable, originalId);
      const isBucketed = bucketedColumns.some((id) => id === columnId);
      const colorByTerms = shouldColorByTerms(colInfo?.meta.type, isBucketed);
      const categoryRows = (untransposedDataRef.current ?? firstLocalTable)?.rows;

      const data: ColorMappingInputData = colorByTerms
        ? {
            type: 'categories',
            categories: colorMapping
              ? getColorCategories(categoryRows, originalId, [null])
              : getLegacyColorCategories(categoryRows, originalId, [null]),
          }
        : {
            type: 'ranges',
            bins: 0,
            ...(minMaxByColumnId.get(originalId) ?? getFallbackDataBounds()),
          };
      const colorFn = getCellColorFn(
        props.paletteService,
        palettes,
        data,
        colorByTerms,
        isDarkMode,
        syncColors,
        palette,
        colorMapping
      );
      cellColorFnMap.set(originalId, colorFn);

      return colorFn;
    };

    return createGridCell(
      formatters,
      columnConfig,
      DataContext,
      isDarkMode,
      getCellColor,
      props.args.fitRowToContent
    );
  }, [
    formatters,
    columnConfig,
    isDarkMode,
    props.args.fitRowToContent,
    props.paletteService,
    palettes,
    firstLocalTable,
    bucketedColumns,
    minMaxByColumnId,
    syncColors,
  ]);

  const columnVisibility = useMemo(
    () => ({
      visibleColumns,
      setVisibleColumns: () => {},
    }),
    [visibleColumns]
  );

  const sorting = useMemo<EuiDataGridSorting | undefined>(
    () =>
      createGridSortingConfig(
        columnConfig.sortingColumnId,
        columnConfig.sortingDirection as LensGridDirection,
        onEditAction
      ),
    [onEditAction, columnConfig]
  );

  const renderSummaryRow = useMemo(() => {
    const columnsWithSummary = columnConfig.columns
      .filter((col) => !!col.columnId && !col.hidden)
      .map((config) => ({
        columnId: config.columnId,
        summaryRowValue: config.summaryRowValue,
        ...getFinalSummaryConfiguration(config.columnId, config, props.data),
      }))
      .filter(({ summaryRow }) => summaryRow !== 'none');

    if (columnsWithSummary.length) {
      const summaryLookup = Object.fromEntries(
        columnsWithSummary.map(({ summaryRowValue, summaryLabel, columnId }) => [
          columnId,
          summaryLabel === '' ? `${summaryRowValue}` : `${summaryLabel}: ${summaryRowValue}`,
        ])
      );
      return ({ columnId }: { columnId: string }) => {
        const currentAlignment = alignments.get(columnId);
        const alignmentClassName = `lnsTableCell--${currentAlignment}`;
        const columnName =
          columns.find(({ id }) => id === columnId)?.displayAsText?.replace(/ /g, '-') || columnId;
        return summaryLookup[columnId] != null ? (
          <div
            className={`lnsTableCell ${alignmentClassName}`}
            data-test-subj={`lnsDataTable-footer-${columnName}`}
          >
            {summaryLookup[columnId]}
          </div>
        ) : null;
      };
    }
  }, [columnConfig.columns, alignments, props.data, columns]);

  const gridStyle = useMemo<EuiDataGridStyle>(
    () => ({
      ...DATA_GRID_STYLE_DEFAULT,
      ...(props.args.density
        ? DATA_GRID_DENSITY_STYLE_MAP[props.args.density]
        : DATA_GRID_STYLE_NORMAL),
    }),
    [props.args.density]
  );

  if (isEmpty) {
    return (
      <div
        css={datatableContainerStyles}
        className="eui-scrollBar"
        data-test-subj="lnsVisualizationContainer"
      >
        <EmptyPlaceholder icon={IconChartDatatable} />
      </div>
    );
  }

  const dataGridAriaLabel =
    props.args.title ||
    i18n.translate('xpack.lens.table.defaultAriaLabel', {
      defaultMessage: 'Data table visualization',
    });

  return (
    <div
      css={datatableContainerStyles}
      className="eui-scrollBar"
      data-test-subj="lnsVisualizationContainer"
    >
      <DataContext.Provider
        value={{
          table: firstLocalTable,
          rowHasRowClickTriggerActions: props.rowHasRowClickTriggerActions,
          alignments,
          minMaxByColumnId,
          handleFilterClick,
        }}
      >
        <EuiDataGrid
          aria-label={dataGridAriaLabel}
          data-test-subj="lnsDataTable"
          rowHeightsOptions={{
            defaultHeight: props.args.fitRowToContent
              ? RowHeightMode.auto
              : props.args.rowHeightLines && props.args.rowHeightLines !== 1
              ? {
                  lineCount: props.args.rowHeightLines,
                }
              : undefined,
          }}
          inMemory={{ level: 'sorting' }}
          columns={columns}
          columnVisibility={columnVisibility}
          trailingControlColumns={trailingControlColumns}
          rowCount={firstLocalTable.rows.length}
          renderCellValue={renderCellValue}
          gridStyle={gridStyle}
          schemaDetectors={schemaDetectors}
          sorting={sorting}
          pagination={
            pagination && {
              ...pagination,
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              onChangeItemsPerPage,
              onChangePage,
            }
          }
          onColumnResize={onColumnResize}
          toolbarVisibility={false}
          renderFooterCellValue={renderSummaryRow}
          ref={dataGridRef}
        />
      </DataContext.Provider>
    </div>
  );
};

const datatableContainerStyles = css`
  height: 100%;
  overflow: auto hidden;
  user-select: text;

  .lnsTableCell--multiline {
    white-space: pre-wrap;
  }

  .lnsTableCell--left {
    text-align: left;
  }

  .lnsTableCell--right {
    text-align: right;
  }

  .lnsTableCell--center {
    text-align: center;
  }
`;
