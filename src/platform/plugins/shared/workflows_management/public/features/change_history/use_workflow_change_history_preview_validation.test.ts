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
import {
  getPreviewSchemasFingerprint,
  useWorkflowChangeHistoryPreviewValidation,
  type UseWorkflowChangeHistoryPreviewValidationParams,
} from './use_workflow_change_history_preview_validation';
import { waitForPreviewYamlSchemaMarkers } from './wait_for_yaml_schema_markers_after_update';
import type { WorkflowChangeHistoryCompareMode } from './workflow_change_history_preview_settings_popover';
import { navigateToErrorPosition } from '../../widgets/workflow_yaml_editor/lib/utils';
import type { YamlValidationResult } from '../validate_workflow_yaml/model/types';
import { useWorkflowJsonSchema } from '../validate_workflow_yaml/model/use_workflow_json_schema';

jest.mock('../../shared/ui/yaml_editor/yaml_language_service', () => ({
  yamlLanguageService: {
    update: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('./apply_workflow_yaml_validation_to_editor', () => ({
  applyWorkflowYamlValidationToEditor: jest.fn(() =>
    Promise.resolve({ validationResults: [], yamlDocument: null })
  ),
  applyValidationHighlightsToEditor: jest.fn(),
}));

jest.mock('./collect_yaml_schema_validation_results', () => {
  const actual = jest.requireActual('./collect_yaml_schema_validation_results');
  return {
    ...actual,
    collectYamlSchemaValidationResults: jest.fn(() => []),
    mergeWorkflowYamlValidationResults: jest.fn(
      (customResults: YamlValidationResult[], yamlResults: YamlValidationResult[]) =>
        actual.mergeWorkflowYamlValidationResults(customResults, yamlResults)
    ),
  };
});

jest.mock('../validate_workflow_yaml/model/use_workflow_json_schema', () => ({
  useWorkflowJsonSchema: jest.fn(() => ({
    jsonSchema: { type: 'object' },
    uri: 'file:///workflow-schema.json',
  })),
}));

jest.mock('../../entities/connectors/model/use_available_connectors', () => ({
  useAvailableConnectors: jest.fn(() => ({ connectorTypes: {} })),
}));

jest.mock('./wait_for_yaml_schema_markers_after_update', () => ({
  waitForPreviewYamlSchemaMarkers: jest.fn(async (_model, schemas: unknown[]) => {
    const { yamlLanguageService } = jest.requireMock(
      '../../shared/ui/yaml_editor/yaml_language_service'
    ) as { yamlLanguageService: { update: jest.Mock } };

    if (schemas.length > 0) {
      await yamlLanguageService.update(schemas);
    }
  }),
}));

const mockApplyValidation = applyWorkflowYamlValidationToEditor as jest.Mock;
const mockApplyHighlights = applyValidationHighlightsToEditor as jest.Mock;
const mockCollectYamlResults = collectYamlSchemaValidationResults as jest.Mock;
const mockUseWorkflowJsonSchema = useWorkflowJsonSchema as jest.Mock;
const mockWaitForPreviewYamlSchemaMarkers = waitForPreviewYamlSchemaMarkers as jest.Mock;

const { yamlLanguageService } = jest.requireMock(
  '../../shared/ui/yaml_editor/yaml_language_service'
) as {
  yamlLanguageService: { update: jest.Mock };
};
const mockYamlLanguageServiceUpdate = yamlLanguageService.update;

let markerChangeListener: ((uris: monaco.Uri[]) => void) | undefined;
let mockModelYaml = 'name: test\n';

const mockEditor = {
  getModel: jest.fn(() => ({
    getValue: () => mockModelYaml,
    uri: { toString: () => 'inmemory://model/test.yaml' },
  })),
  updateOptions: jest.fn(),
} as unknown as monaco.editor.IStandaloneCodeEditor;

const mockDiffEditor = {
  updateOptions: jest.fn(),
  getModifiedEditor: jest.fn(() => mockEditor),
} as unknown as monaco.editor.IStandaloneDiffEditor;

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
      getModelMarkers: jest.fn(() => []),
    },
  },
}));

const { monaco: mockMonaco } = jest.requireMock('@kbn/code-editor') as {
  monaco: { editor: { getModelMarkers: jest.Mock } };
};
const mockGetModelMarkers = mockMonaco.editor.getModelMarkers;

const sampleYamlMarker = {
  resource: { toString: () => 'inmemory://model/test.yaml' },
  owner: 'yaml',
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 5,
  severity: 8,
  message: 'Missing property "steps".',
} as monaco.editor.IMarker;

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
  overrides: Partial<UseWorkflowChangeHistoryPreviewValidationParams> = {}
): UseWorkflowChangeHistoryPreviewValidationParams => {
  const editorRef = {
    current: mockEditor,
  } as MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  const diffEditorRef = {
    current: mockDiffEditor,
  } as MutableRefObject<monaco.editor.IStandaloneDiffEditor | null>;
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

describe('getPreviewSchemasFingerprint', () => {
  it('fingerprints schema registration by uri only', () => {
    const schemas = [
      {
        fileMatch: ['*'],
        uri: 'file:///workflow-schema.json',
        schema: { type: 'object' as const },
      },
    ];
    const sameUriDifferentBody = [
      {
        fileMatch: ['*'],
        uri: 'file:///workflow-schema.json',
        schema: { type: 'string' as const },
      },
    ];

    expect(getPreviewSchemasFingerprint(schemas)).toBe('file:///workflow-schema.json');
    expect(getPreviewSchemasFingerprint(sameUriDifferentBody)).toBe('file:///workflow-schema.json');
    expect(getPreviewSchemasFingerprint(schemas)).toBe(
      getPreviewSchemasFingerprint(sameUriDifferentBody)
    );
  });
});

describe('useWorkflowChangeHistoryPreviewValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    markerChangeListener = undefined;
    mockModelYaml = 'name: test\n';
    mockGetModelMarkers.mockReturnValue([]);
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

  it('clears stale validation results and re-runs when validationYaml changes', async () => {
    mockApplyValidation.mockResolvedValue({
      validationResults: [sampleCustomError],
      yamlDocument: null,
    });

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
    });

    mockApplyValidation.mockClear();
    mockApplyValidation.mockResolvedValue({
      validationResults: [],
      yamlDocument: null,
    });
    mockCollectYamlResults.mockReturnValue([]);

    mockModelYaml = 'name: valid\n';
    rerender({ ...params, validationYaml: 'name: valid\n' });

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toEqual([]);
      expect(result.current.isValidationLoading).toBe(false);
    });

    expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    expect(mockApplyValidation).toHaveBeenCalledWith(
      mockEditor,
      'name: valid\n',
      true,
      params.validationDecorationsRef,
      expect.any(AbortSignal),
      { skipApplyingHighlights: true }
    );
  });

  it('reuses existing yaml markers without waiting for schema registration on subsequent runs', async () => {
    mockGetModelMarkers.mockReturnValue([]);

    const params = createHookParams({ highlightValidationErrors: true });
    const { rerender } = renderHook((props) => useWorkflowChangeHistoryPreviewValidation(props), {
      initialProps: params,
    });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    expect(mockWaitForPreviewYamlSchemaMarkers).toHaveBeenCalledTimes(1);
    expect(mockWaitForPreviewYamlSchemaMarkers).toHaveBeenCalledWith(
      expect.objectContaining({ getValue: expect.any(Function) }),
      expect.any(Array),
      expect.any(AbortSignal),
      expect.objectContaining({ registerSchemas: true })
    );

    mockApplyValidation.mockClear();
    mockWaitForPreviewYamlSchemaMarkers.mockClear();
    mockCollectYamlResults.mockReturnValue([]);
    mockGetModelMarkers.mockReturnValue([sampleYamlMarker]);

    mockModelYaml = 'name: valid\n';
    rerender({ ...params, validationYaml: 'name: valid\n' });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    expect(mockWaitForPreviewYamlSchemaMarkers).not.toHaveBeenCalled();
    expect(mockCollectYamlResults).toHaveBeenCalled();
  });

  it('merges marker changes after the yaml phase while custom validation is still running', async () => {
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
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);
    mockGetModelMarkers.mockReturnValue([sampleYamlMarker]);

    const params = createHookParams({ highlightValidationErrors: true });
    const { result } = renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isValidationLoading).toBe(false);

    act(() => {
      markerChangeListener?.([{ toString: () => 'inmemory://model/test.yaml' } as monaco.Uri]);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.validationResults).toHaveLength(1);
    expect(result.current.validationResults[0].owner).toBe('yaml');

    await act(async () => {
      resolveValidation({ validationResults: [sampleCustomError], yamlDocument: null });
      await validationPromise;
    });

    jest.useRealTimers();

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(2);
    });
  });

  it('merges yaml schema markers on the initial publish', async () => {
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

  it('merges yaml schema markers after marker changes', async () => {
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
    mockGetModelMarkers.mockReturnValue([sampleYamlMarker]);

    act(() => {
      markerChangeListener?.([{ toString: () => 'inmemory://model/test.yaml' } as monaco.Uri]);
    });

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

  it('publishes yaml markers immediately when switching versions without schema wait', async () => {
    mockGetModelMarkers.mockReturnValue([]);
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);

    const params = createHookParams({ highlightValidationErrors: true });
    const { result, rerender } = renderHook(
      (props) => useWorkflowChangeHistoryPreviewValidation(props),
      { initialProps: params }
    );

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    mockApplyValidation.mockClear();
    mockApplyValidation.mockReturnValue(new Promise(() => undefined));
    mockWaitForPreviewYamlSchemaMarkers.mockClear();
    mockCollectYamlResults.mockClear();
    mockGetModelMarkers.mockReturnValue([sampleYamlMarker]);
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);

    mockModelYaml = 'name: invalid\n';
    rerender({ ...params, validationYaml: 'name: invalid\n' });

    await waitForValidationSettled(() => {
      expect(result.current.validationResults).toHaveLength(1);
      expect(result.current.validationResults[0].owner).toBe('yaml');
      expect(result.current.isValidationLoading).toBe(false);
    });

    expect(mockWaitForPreviewYamlSchemaMarkers).not.toHaveBeenCalled();
    expect(mockCollectYamlResults).toHaveBeenCalled();
  });

  it('ignores marker changes that only affect custom highlight markers', async () => {
    const params = createHookParams({ highlightValidationErrors: true });
    renderHook(() => useWorkflowChangeHistoryPreviewValidation(params));

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await flushAsyncValidationUpdates();

    mockCollectYamlResults.mockClear();
    mockGetModelMarkers.mockReturnValue([]);

    act(() => {
      markerChangeListener?.([{ toString: () => 'inmemory://model/test.yaml' } as monaco.Uri]);
    });

    expect(mockCollectYamlResults).not.toHaveBeenCalled();
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

    expect(mockYamlLanguageServiceUpdate).not.toHaveBeenCalled();

    mockApplyValidation.mockClear();
    mockCollectYamlResults.mockReturnValue([sampleYamlError]);

    schemaLoaded = true;
    rerender({ ...params, highlightValidationErrors: true });

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalledTimes(1);
    });

    expect(mockYamlLanguageServiceUpdate).toHaveBeenCalled();

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
