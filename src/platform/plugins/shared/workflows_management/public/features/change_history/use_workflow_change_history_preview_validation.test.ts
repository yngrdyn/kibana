/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { monaco } from '@kbn/code-editor';
import {
  applyValidationHighlightsToEditor,
  applyWorkflowYamlValidationToEditor,
} from './apply_workflow_yaml_validation_to_editor';
import {
  collectYamlSchemaValidationResults,
  mergeWorkflowYamlValidationResults,
} from './collect_yaml_schema_validation_results';
import { useWorkflowChangeHistoryPreviewValidation } from './use_workflow_change_history_preview_validation';
import { waitForYamlSchemaMarkersAfterUpdate } from './wait_for_yaml_schema_markers_after_update';
import { WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS } from './workflow_change_history_preview_constants';
import type { WorkflowChangeHistoryCompareMode } from './workflow_change_history_preview_settings_popover';
import { navigateToErrorPosition } from '../../widgets/workflow_yaml_editor/lib/utils';
import type { YamlValidationResult } from '../validate_workflow_yaml/model/types';
import { useWorkflowJsonSchema } from '../validate_workflow_yaml/model/use_workflow_json_schema';

jest.mock('./wait_for_yaml_schema_markers_after_update', () => ({
  waitForYamlSchemaMarkersAfterUpdate: jest.fn(() => Promise.resolve()),
}));

jest.mock('./apply_workflow_yaml_validation_to_editor', () => ({
  applyWorkflowYamlValidationToEditor: jest.fn(() =>
    Promise.resolve({ validationResults: [], yamlDocument: null })
  ),
  applyValidationHighlightsToEditor: jest.fn(),
}));

jest.mock('./collect_yaml_schema_validation_results', () => ({
  collectYamlSchemaValidationResults: jest.fn(() => []),
  mergeWorkflowYamlValidationResults: jest.fn(
    (customResults: YamlValidationResult[], yamlResults: YamlValidationResult[]) => [
      ...customResults,
      ...yamlResults,
    ]
  ),
}));

jest.mock('../validate_workflow_yaml/model/use_workflow_json_schema', () => ({
  useWorkflowJsonSchema: jest.fn(() => ({
    jsonSchema: { type: 'object' },
    uri: 'file:///workflow-schema.json',
  })),
}));

jest.mock('../../entities/connectors/model/use_available_connectors', () => ({
  useAvailableConnectors: jest.fn(() => ({ connectorTypes: {} })),
}));

const mockApplyValidation = applyWorkflowYamlValidationToEditor as jest.Mock;
const mockApplyHighlights = applyValidationHighlightsToEditor as jest.Mock;
const mockCollectYamlResults = collectYamlSchemaValidationResults as jest.Mock;
const mockWaitForYamlSchemaMarkersAfterUpdate = waitForYamlSchemaMarkersAfterUpdate as jest.Mock;
const mockUseWorkflowJsonSchema = useWorkflowJsonSchema as jest.Mock;

let markerChangeListener: ((uris: monaco.Uri[]) => void) | undefined;

const mockEditor = {
  getModel: jest.fn(() => ({
    getValue: () => 'name: test\n',
    uri: { toString: () => 'inmemory://model/test.yaml' },
  })),
  updateOptions: jest.fn(),
};

const mockDiffEditor = {
  updateOptions: jest.fn(),
  getModifiedEditor: jest.fn(() => mockEditor),
};

jest.mock('../../widgets/workflow_yaml_editor/lib/utils', () => ({
  navigateToErrorPosition: jest.fn(),
}));

jest.mock('@kbn/code-editor', () => ({
  monaco: {
    editor: {
      onDidChangeMarkers: jest.fn((listener: (uris: monaco.Uri[]) => void) => {
        markerChangeListener = listener;
        return { dispose: jest.fn() };
      }),
      setModelMarkers: jest.fn(),
    },
  },
}));

const sampleCustomError: YamlValidationResult = {
  id: 'custom-error',
  owner: 'step-name-validation',
  severity: 'error',
  message: 'Duplicate step name',
  startLineNumber: 2,
  startColumn: 1,
  endLineNumber: 2,
  endColumn: 10,
  hoverMessage: null,
  afterMessage: null,
};

const sampleYamlError: YamlValidationResult = {
  id: 'yaml-error',
  owner: 'yaml',
  severity: 'error',
  message: 'Missing property "steps".',
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 5,
  hoverMessage: null,
  afterMessage: null,
};

const createHookParams = (
  overrides: Partial<Parameters<typeof useWorkflowChangeHistoryPreviewValidation>[0]> = {}
) => {
  const editorRef = { current: mockEditor } as MutableRefObject<typeof mockEditor | null>;
  const diffEditorRef = { current: mockDiffEditor } as MutableRefObject<
    typeof mockDiffEditor | null
  >;
  const compareModeRef = { current: 'unified' as WorkflowChangeHistoryCompareMode };
  const validationDecorationsRef = {
    current: null,
  } as MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>;

  return {
    getActiveEditor: () => mockEditor,
    validationDecorationsRef,
    validationYaml: 'name: test\n',
    highlightValidationErrors: false,
    isEditorMounted: true,
    editorRef,
    diffEditorRef,
    compareModeRef,
    configureDiffEditors: jest.fn(),
    ...overrides,
  };
};

const flushAsyncValidationUpdates = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });
};

const waitForValidationSettled = async (assertion: () => void): Promise<void> => {
  await flushAsyncValidationUpdates();
  await act(async () => {
    await waitFor(assertion);
  });
};

describe('useWorkflowChangeHistoryPreviewValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    markerChangeListener = undefined;
    mockUseWorkflowJsonSchema.mockReturnValue({
      jsonSchema: { type: 'object' },
      uri: 'file:///workflow-schema.json',
    });
    mockApplyValidation.mockResolvedValue({
      validationResults: [sampleCustomError],
      yamlDocument: null,
    });
    mockCollectYamlResults.mockReturnValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears validation results when highlight is disabled', async () => {
    mockApplyValidation.mockResolvedValueOnce({
      validationResults: [sampleCustomError],
      yamlDocument: null,
    });

    const params = createHookParams();
    const { result, rerender } = renderHook(
      (props) => useWorkflowChangeHistoryPreviewValidation(props),
      { initialProps: params }
    );

    rerender({ ...params, highlightValidationErrors: true });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await flushAsyncValidationUpdates();

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(1);
      expect(result.current.isValidationLoading).toBe(false);
    });

    rerender({ ...params, highlightValidationErrors: false });

    expect(result.current.validationResults).toEqual([]);

    expect(mockApplyValidation).toHaveBeenLastCalledWith(
      mockEditor,
      'name: test\n',
      false,
      params.validationDecorationsRef
    );
  });

  it('runs validation once when highlight is enabled and skips inline highlight apply', async () => {
    const params = createHookParams({ highlightValidationErrors: true });

    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    expect(result.current.isValidationLoading).toBe(true);

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    expect(mockApplyValidation).toHaveBeenCalledWith(
      mockEditor,
      'name: test\n',
      true,
      params.validationDecorationsRef,
      expect.any(AbortSignal),
      { skipApplyingHighlights: true }
    );

    await waitForValidationSettled(() => {
      expect(mockApplyHighlights).toHaveBeenCalledTimes(1);
      expect(result.current.isValidationLoading).toBe(false);
    });
  });

  it('does not re-run validation when highlight stays enabled and editor remounts', async () => {
    const params = createHookParams({ highlightValidationErrors: true });

    const { rerender } = renderHook((props) => useWorkflowChangeHistoryPreviewValidation(props), {
      initialProps: params,
    });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    mockApplyValidation.mockClear();

    rerender({ ...params, isEditorMounted: false });
    rerender({ ...params, isEditorMounted: true });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApplyValidation).not.toHaveBeenCalled();
  });

  it('ignores marker changes before the initial validation pass completes', async () => {
    jest.useFakeTimers();

    let resolveValidation!: (value: {
      validationResults: YamlValidationResult[];
      yamlDocument: null;
    }) => void;
    const validationPromise = new Promise<{
      validationResults: YamlValidationResult[];
      yamlDocument: null;
    }>((resolve) => {
      resolveValidation = resolve;
    });
    mockApplyValidation.mockReturnValue(validationPromise);

    const params = createHookParams({ highlightValidationErrors: true });
    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    expect(result.current.isValidationLoading).toBe(true);
    expect(result.current.validationResults).toEqual([]);

    act(() => {
      markerChangeListener?.([{ toString: () => 'inmemory://model/test.yaml' } as monaco.Uri]);
      jest.advanceTimersByTime(WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS);
    });

    expect(result.current.validationResults).toEqual([]);
    expect(result.current.isValidationLoading).toBe(true);

    await act(async () => {
      resolveValidation({ validationResults: [sampleCustomError], yamlDocument: null });
      await validationPromise;
    });

    jest.useRealTimers();

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(1);
      expect(result.current.isValidationLoading).toBe(false);
    });
  });

  it('merges yaml schema markers on the initial publish after debounce', async () => {
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);

    const params = createHookParams({ highlightValidationErrors: true });
    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await flushAsyncValidationUpdates();

    await waitForValidationSettled(() => {
      expect(mergeWorkflowYamlValidationResults).toHaveBeenCalledWith(
        [sampleCustomError],
        [sampleYamlError]
      );
      expect(result.current.validationResults).toHaveLength(2);
      expect(result.current.validationResults.map((entry) => entry.owner)).toEqual([
        'step-name-validation',
        'yaml',
      ]);
      expect(result.current.isValidationLoading).toBe(false);
    });
  });

  it('merges yaml schema markers after debounced marker changes', async () => {
    const params = createHookParams({ highlightValidationErrors: true });
    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await flushAsyncValidationUpdates();

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(1);
    });

    mockCollectYamlResults.mockReturnValue([sampleYamlError]);
    mockApplyHighlights.mockClear();

    jest.useFakeTimers();

    act(() => {
      markerChangeListener?.([{ toString: () => 'inmemory://model/test.yaml' } as monaco.Uri]);
    });

    act(() => {
      jest.advanceTimersByTime(WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS);
    });

    jest.useRealTimers();

    await waitForValidationSettled(() => {
      expect(mockCollectYamlResults).toHaveBeenCalled();
      expect(mergeWorkflowYamlValidationResults).toHaveBeenCalledWith(
        [sampleCustomError],
        [sampleYamlError]
      );
      expect(result.current.validationResults).toHaveLength(2);
      expect(mockApplyHighlights).toHaveBeenCalled();
    });
  });

  it('navigates to the validation error position when a row is clicked', () => {
    const params = createHookParams({ highlightValidationErrors: true });
    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    result.current.handleValidationErrorClick(sampleCustomError);

    expect(navigateToErrorPosition).toHaveBeenCalledWith(mockEditor, 2, 1);
  });

  it('re-runs validation when the workflow json schema loads after highlight is enabled', async () => {
    let schemaLoaded = false;
    mockUseWorkflowJsonSchema.mockImplementation(() => ({
      jsonSchema: schemaLoaded ? { type: 'object' } : null,
      uri: schemaLoaded ? 'file:///workflow-schema.json' : undefined,
    }));

    const params = createHookParams({ highlightValidationErrors: true });
    const { result, rerender } = renderHook(
      (props) => useWorkflowChangeHistoryPreviewValidation(props),
      { initialProps: params }
    );

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(1);
      expect(result.current.isValidationLoading).toBe(false);
    });

    expect(mockWaitForYamlSchemaMarkersAfterUpdate).not.toHaveBeenCalled();

    mockApplyValidation.mockClear();
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);

    schemaLoaded = true;
    rerender({ ...params, highlightValidationErrors: true });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    expect(mockWaitForYamlSchemaMarkersAfterUpdate).toHaveBeenCalled();

    await waitForValidationSettled(() => {
      expect(mergeWorkflowYamlValidationResults).toHaveBeenCalledWith(
        [sampleCustomError],
        [sampleYamlError]
      );
      expect(result.current.validationResults).toHaveLength(2);
      expect(result.current.validationResults.map((entry) => entry.owner)).toEqual([
        'step-name-validation',
        'yaml',
      ]);
    });
  });
});
