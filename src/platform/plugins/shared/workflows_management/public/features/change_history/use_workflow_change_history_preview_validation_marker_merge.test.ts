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
import { monaco } from '@kbn/code-editor';
import * as applyWorkflowYamlValidationToEditorModule from './apply_workflow_yaml_validation_to_editor';
import { collectYamlSchemaValidationResults } from './collect_yaml_schema_validation_results';
import { useWorkflowChangeHistoryPreviewValidation } from './use_workflow_change_history_preview_validation';
import type { WorkflowChangeHistoryCompareMode } from './workflow_change_history_preview_settings_popover';
import { getWorkflowZodSchema } from '../../../common/schema';
import { performComputation } from '../../entities/workflows/store/workflow_detail/utils/computation';
import { triggerSchemas } from '../../trigger_schemas';
import type { YamlValidationResult } from '../validate_workflow_yaml/model/types';
import { useWorkflowJsonSchema } from '../validate_workflow_yaml/model/use_workflow_json_schema';

jest.mock('./apply_workflow_yaml_validation_to_editor', () => {
  const actual = jest.requireActual('./apply_workflow_yaml_validation_to_editor');
  return {
    ...actual,
    applyWorkflowYamlValidationToEditor: jest.fn(),
    applyValidationHighlightsToEditor: jest.fn(actual.applyValidationHighlightsToEditor),
  };
});

jest.mock('../validate_workflow_yaml/model/use_workflow_json_schema', () => ({
  useWorkflowJsonSchema: jest.fn(() => ({
    jsonSchema: { type: 'object' },
    uri: 'file:///workflow-schema.json',
  })),
}));

jest.mock('../validate_workflow_yaml/lib/use_workflow_yaml_validation_context', () => ({
  useWorkflowYamlValidationContextRef: jest.fn(() => ({
    current: {
      connectorTypes: {},
      connectorsManagementUrl: 'http://test/connectors',
      workflows: { workflows: {}, totalWorkflows: 0 },
      getPropertyHandler: () => undefined,
      esqlCallbacks: {},
    },
  })),
}));

jest.mock('../../entities/connectors/model/use_available_connectors', () => ({
  useAvailableConnectors: jest.fn(() => ({ connectorTypes: {} })),
}));

jest.mock('../../shared/ui/yaml_editor/yaml_language_service', () => ({
  yamlLanguageService: {
    update: jest.fn(() => Promise.resolve()),
  },
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

const mockApplyValidation =
  applyWorkflowYamlValidationToEditorModule.applyWorkflowYamlValidationToEditor as jest.Mock;
const mockApplyHighlights =
  applyWorkflowYamlValidationToEditorModule.applyValidationHighlightsToEditor as jest.Mock;
const mockUseWorkflowJsonSchema = useWorkflowJsonSchema as jest.Mock;

const mockWorkflowJsonSchema = { type: 'object' };
const getActiveEditor = (): monaco.editor.IStandaloneCodeEditor => mockEditor;
const configureDiffEditors = jest.fn();

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

let markerChangeListener: ((uris: monaco.Uri[]) => void) | undefined;
let editorModel: monaco.editor.ITextModel;
let mockEditor: monaco.editor.IStandaloneCodeEditor;

const createMockEditor = (): monaco.editor.IStandaloneCodeEditor => {
  const decorationsCollection = { clear: jest.fn() };

  return {
    getModel: () => editorModel,
    updateOptions: jest.fn(),
    createDecorationsCollection: jest.fn(() => decorationsCollection),
  } as unknown as monaco.editor.IStandaloneCodeEditor;
};

describe('useWorkflowChangeHistoryPreviewValidation marker merge integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    markerChangeListener = undefined;
    mockUseWorkflowJsonSchema.mockReturnValue({
      jsonSchema: mockWorkflowJsonSchema,
      uri: 'file:///workflow-schema.json',
    });

    const yaml = 'name: test-workflow\n';
    const computed = performComputation(yaml);
    editorModel = monaco.editor.createModel(yaml, 'yaml');
    mockEditor = createMockEditor();

    const originalOnDidChangeMarkers = monaco.editor.onDidChangeMarkers.bind(monaco.editor);
    jest.spyOn(monaco.editor, 'onDidChangeMarkers').mockImplementation((listener) => {
      markerChangeListener = listener;
      return originalOnDidChangeMarkers(listener);
    });

    mockApplyValidation.mockResolvedValue({
      validationResults: [sampleCustomError],
      yamlDocument: computed.yamlDocument ?? null,
    });
  });

  afterEach(() => {
    editorModel.dispose();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('merges real yaml schema markers with custom validation via collectYamlSchemaValidationResults', async () => {
    const workflowZodSchema = getWorkflowZodSchema({}, triggerSchemas.getRegisteredIds());
    const validationDecorationsRef = {
      current: null,
    } as MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>;
    const compareModeRef = { current: 'unified' as WorkflowChangeHistoryCompareMode };

    const { result } = renderHook(() =>
      useWorkflowChangeHistoryPreviewValidation({
        getActiveEditor,
        validationDecorationsRef,
        validationYaml: editorModel.getValue(),
        highlightValidationErrors: true,
        isEditorMounted: true,
        editorRef: { current: mockEditor },
        diffEditorRef: { current: null },
        compareModeRef,
        configureDiffEditors,
      })
    );

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.validationResults).toHaveLength(1);
      expect(result.current.validationResults[0].owner).toBe('step-name-validation');
      expect(result.current.isValidationLoading).toBe(false);
      expect(mockApplyHighlights).toHaveBeenCalled();
    });

    mockApplyHighlights.mockClear();

    monaco.editor.setModelMarkers(editorModel, 'yaml', [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 5,
        message: 'Missing property "steps".',
        severity: monaco.MarkerSeverity.Error,
        source: 'yaml-schema: file:///workflow-schema.json',
      },
    ]);

    act(() => {
      markerChangeListener?.([editorModel.uri]);
    });

    await waitFor(() => {
      expect(result.current.validationResults).toHaveLength(2);
      expect(result.current.validationResults.map((entry) => entry.owner)).toEqual([
        'step-name-validation',
        'yaml',
      ]);
      expect(result.current.validationResults[1].message).toContain('steps');
      expect(mockApplyHighlights).toHaveBeenCalled();
    });

    const mergedResults = mockApplyHighlights.mock.calls.at(-1)?.[1] as YamlValidationResult[];
    expect(mergedResults).toHaveLength(2);
    expect(mergedResults.filter((entry) => entry.owner === 'yaml')).toHaveLength(1);

    const republishedYamlResults = collectYamlSchemaValidationResults(
      editorModel,
      null,
      workflowZodSchema
    );
    expect(republishedYamlResults).toHaveLength(1);
  });

  it('includes yaml schema markers on the first publish when markers already exist', async () => {
    const validationDecorationsRef = {
      current: null,
    } as MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>;
    const compareModeRef = { current: 'unified' as WorkflowChangeHistoryCompareMode };

    monaco.editor.setModelMarkers(editorModel, 'yaml', [
      {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 5,
        message: 'Missing property "steps".',
        severity: monaco.MarkerSeverity.Error,
        source: 'yaml-schema: file:///workflow-schema.json',
      },
    ]);

    const { result } = renderHook(() =>
      useWorkflowChangeHistoryPreviewValidation({
        getActiveEditor,
        validationDecorationsRef,
        validationYaml: editorModel.getValue(),
        highlightValidationErrors: true,
        isEditorMounted: true,
        editorRef: { current: mockEditor },
        diffEditorRef: { current: null },
        compareModeRef,
        configureDiffEditors,
      })
    );

    await waitFor(() => {
      expect(mockApplyValidation).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.validationResults).toHaveLength(2);
      expect(result.current.validationResults.map((entry) => entry.owner)).toEqual([
        'step-name-validation',
        'yaml',
      ]);
      expect(result.current.isValidationLoading).toBe(false);
    });
  });
});
