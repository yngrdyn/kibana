/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SchemasSettings } from 'monaco-yaml';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import type { Document } from 'yaml';
import { monaco } from '@kbn/code-editor';
import {
  applyValidationHighlightsToEditor,
  applyWorkflowYamlValidationToEditor,
} from './apply_workflow_yaml_validation_to_editor';
import {
  collectYamlSchemaValidationResults,
  mergeWorkflowYamlValidationResults,
} from './collect_yaml_schema_validation_results';
import { waitForYamlSchemaMarkersAfterUpdate } from './wait_for_yaml_schema_markers_after_update';
import { WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS } from './workflow_change_history_preview_constants';
import type { WorkflowChangeHistoryCompareMode } from './workflow_change_history_preview_settings_popover';
import { getWorkflowZodSchema } from '../../../common/schema';
import { useAvailableConnectors } from '../../entities/connectors/model/use_available_connectors';
import { triggerSchemas } from '../../trigger_schemas';
import { navigateToErrorPosition } from '../../widgets/workflow_yaml_editor/lib/utils';
import { getWorkflowValidationDisplayOptions } from '../../widgets/workflow_yaml_editor/lib/workflow_monaco_layout_options';
import type { YamlValidationResult } from '../validate_workflow_yaml/model/types';
import { useWorkflowJsonSchema } from '../validate_workflow_yaml/model/use_workflow_json_schema';

export interface UseWorkflowChangeHistoryPreviewValidationParams {
  getActiveEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  validationDecorationsRef: MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>;
  validationYaml: string;
  highlightValidationErrors: boolean;
  isEditorMounted: boolean;
  editorRef: MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  diffEditorRef: MutableRefObject<monaco.editor.IStandaloneDiffEditor | null>;
  compareModeRef: MutableRefObject<WorkflowChangeHistoryCompareMode>;
  configureDiffEditors: (
    diffEditor: monaco.editor.IStandaloneDiffEditor,
    compareMode: WorkflowChangeHistoryCompareMode,
    highlightValidationErrors: boolean
  ) => void;
}

export interface UseWorkflowChangeHistoryPreviewValidationResult {
  validationResults: YamlValidationResult[];
  isValidationLoading: boolean;
  handleValidationErrorClick: (error: YamlValidationResult) => void;
}

export const useWorkflowChangeHistoryPreviewValidation = ({
  getActiveEditor,
  validationDecorationsRef,
  validationYaml,
  highlightValidationErrors,
  isEditorMounted,
  editorRef,
  diffEditorRef,
  compareModeRef,
  configureDiffEditors,
}: UseWorkflowChangeHistoryPreviewValidationParams): UseWorkflowChangeHistoryPreviewValidationResult => {
  const [validationResults, setValidationResults] = useState<YamlValidationResult[]>([]);
  const [isValidationLoading, setIsValidationLoading] = useState(false);
  const [hasInitialValidationPass, setHasInitialValidationPass] = useState(false);
  const hasInitialValidationPassRef = useRef(false);
  const customValidationResultsRef = useRef<YamlValidationResult[]>([]);
  const computedYamlDocumentRef = useRef<Document | null>(null);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const markerRepublishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHighlightEnabledRef = useRef(false);
  const completedInitialPassWithoutYamlSchemaRef = useRef(false);

  const { jsonSchema: workflowJsonSchema, uri: workflowSchemaUri } = useWorkflowJsonSchema({
    loose: false,
  });
  const connectorsData = useAvailableConnectors();
  const workflowZodSchema = useMemo(
    () =>
      getWorkflowZodSchema(connectorsData?.connectorTypes ?? {}, triggerSchemas.getRegisteredIds()),
    [connectorsData?.connectorTypes]
  );
  const monacoYamlSchemas = useMemo((): SchemasSettings[] => {
    if (!workflowSchemaUri || !workflowJsonSchema) {
      return [];
    }

    return [
      {
        fileMatch: ['*'],
        schema: workflowJsonSchema as SchemasSettings['schema'],
        uri: workflowSchemaUri,
      },
    ];
  }, [workflowJsonSchema, workflowSchemaUri]);

  const monacoYamlSchemasRef = useRef(monacoYamlSchemas);
  monacoYamlSchemasRef.current = monacoYamlSchemas;

  const syncValidationDisplay = useCallback(
    (highlight: boolean) => {
      const displayOptions = getWorkflowValidationDisplayOptions(highlight);

      if (editorRef.current) {
        editorRef.current.updateOptions(displayOptions);
      }

      const diffEditor = diffEditorRef.current;
      if (diffEditor) {
        diffEditor.updateOptions(displayOptions);
        configureDiffEditors(diffEditor, compareModeRef.current, highlight);
      }
    },
    [compareModeRef, configureDiffEditors, diffEditorRef, editorRef]
  );

  const clearEditorValidation = useCallback(() => {
    const editor = getActiveEditor();
    if (!editor) {
      return;
    }

    void applyWorkflowYamlValidationToEditor(
      editor,
      validationYaml,
      false,
      validationDecorationsRef
    );
  }, [getActiveEditor, validationDecorationsRef, validationYaml]);

  const clearScheduledMarkerRepublish = useCallback(() => {
    if (markerRepublishTimeoutRef.current) {
      clearTimeout(markerRepublishTimeoutRef.current);
      markerRepublishTimeoutRef.current = null;
    }
  }, []);

  const completeInitialValidationPass = useCallback(() => {
    hasInitialValidationPassRef.current = true;
    setHasInitialValidationPass(true);
  }, []);

  const resetInitialValidationPass = useCallback(() => {
    hasInitialValidationPassRef.current = false;
    setHasInitialValidationPass(false);
  }, []);

  const publishValidationResults = useCallback(
    (
      customResults: YamlValidationResult[],
      options?: { completeInitialPass?: boolean; force?: boolean }
    ) => {
      if (
        !options?.force &&
        !options?.completeInitialPass &&
        !hasInitialValidationPassRef.current
      ) {
        return;
      }

      customValidationResultsRef.current = customResults;

      const editor = getActiveEditor();
      const model = editor?.getModel();
      if (!model) {
        setValidationResults(customResults);
        if (options?.completeInitialPass) {
          completeInitialValidationPass();
        }
        return;
      }

      const yamlSchemaResults = collectYamlSchemaValidationResults(
        model,
        computedYamlDocumentRef.current,
        workflowZodSchema
      );

      const mergedResults = mergeWorkflowYamlValidationResults(customResults, yamlSchemaResults);

      applyValidationHighlightsToEditor(editor, mergedResults, validationDecorationsRef, {
        omitMarginDecorations: true,
      });

      setValidationResults(mergedResults);
      if (options?.completeInitialPass) {
        completeInitialValidationPass();
      }
    },
    [completeInitialValidationPass, getActiveEditor, validationDecorationsRef, workflowZodSchema]
  );

  const finishInitialValidationPass = useCallback(() => {
    completedInitialPassWithoutYamlSchemaRef.current = monacoYamlSchemasRef.current.length === 0;
    publishValidationResults(customValidationResultsRef.current, {
      completeInitialPass: true,
      force: true,
    });
    setIsValidationLoading(false);
  }, [publishValidationResults]);

  const schedulePublishValidationResults = useCallback(
    (customResults: YamlValidationResult[]) => {
      if (!hasInitialValidationPassRef.current) {
        return;
      }

      clearScheduledMarkerRepublish();

      markerRepublishTimeoutRef.current = setTimeout(() => {
        if (!hasInitialValidationPassRef.current) {
          return;
        }

        publishValidationResults(customResults);
        markerRepublishTimeoutRef.current = null;
      }, WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS);
    },
    [clearScheduledMarkerRepublish, publishValidationResults]
  );

  const runValidationRef = useRef<() => Promise<void>>(async () => undefined);

  runValidationRef.current = async () => {
    if (!isEditorMounted || !highlightValidationErrors) {
      return;
    }

    validationAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    validationAbortControllerRef.current = abortController;
    clearScheduledMarkerRepublish();
    setIsValidationLoading(true);

    const editor = getActiveEditor();
    if (!editor || abortController.signal.aborted) {
      if (validationAbortControllerRef.current === abortController) {
        setIsValidationLoading(false);
      }
      return;
    }

    const yamlToValidate = editor.getModel()?.getValue() ?? validationYaml;

    try {
      const { validationResults: nextValidationResults, yamlDocument } =
        await applyWorkflowYamlValidationToEditor(
          editor,
          yamlToValidate,
          true,
          validationDecorationsRef,
          abortController.signal,
          { skipApplyingHighlights: true }
        );

      if (abortController.signal.aborted) {
        return;
      }

      customValidationResultsRef.current = nextValidationResults;
      computedYamlDocumentRef.current = yamlDocument;

      const model = editor.getModel();
      if (model && monacoYamlSchemasRef.current.length > 0) {
        await waitForYamlSchemaMarkersAfterUpdate(
          model,
          monacoYamlSchemasRef.current,
          abortController.signal
        );
      }

      if (abortController.signal.aborted) {
        return;
      }

      finishInitialValidationPass();
    } catch (validationError) {
      if (abortController.signal.aborted) {
        return;
      }

      if (validationError instanceof DOMException && validationError.name === 'AbortError') {
        return;
      }

      customValidationResultsRef.current = [];

      const model = editor.getModel();
      if (model && monacoYamlSchemasRef.current.length > 0) {
        try {
          await waitForYamlSchemaMarkersAfterUpdate(
            model,
            monacoYamlSchemasRef.current,
            abortController.signal
          );
        } catch (waitError) {
          if (
            abortController.signal.aborted ||
            (waitError instanceof DOMException && waitError.name === 'AbortError')
          ) {
            return;
          }
          throw waitError;
        }
      }

      if (abortController.signal.aborted) {
        return;
      }

      finishInitialValidationPass();
    } finally {
      if (
        validationAbortControllerRef.current === abortController &&
        abortController.signal.aborted
      ) {
        setIsValidationLoading(false);
      }
    }
  };

  useEffect(
    () => () => {
      validationAbortControllerRef.current?.abort();
      clearScheduledMarkerRepublish();
    },
    [clearScheduledMarkerRepublish]
  );

  useEffect(() => {
    if (!highlightValidationErrors) {
      wasHighlightEnabledRef.current = false;
      resetInitialValidationPass();
      completedInitialPassWithoutYamlSchemaRef.current = false;
      clearScheduledMarkerRepublish();
      validationAbortControllerRef.current?.abort();
      customValidationResultsRef.current = [];
      computedYamlDocumentRef.current = null;
      setValidationResults([]);
      setIsValidationLoading(false);
      syncValidationDisplay(false);
      clearEditorValidation();
      return;
    }

    const justEnabled = !wasHighlightEnabledRef.current;
    wasHighlightEnabledRef.current = true;

    if (isEditorMounted) {
      syncValidationDisplay(true);
      if (justEnabled) {
        clearScheduledMarkerRepublish();
        void runValidationRef.current();
      }
    }
  }, [
    clearEditorValidation,
    clearScheduledMarkerRepublish,
    highlightValidationErrors,
    isEditorMounted,
    resetInitialValidationPass,
    syncValidationDisplay,
  ]);

  useEffect(() => {
    if (
      !highlightValidationErrors ||
      !isEditorMounted ||
      monacoYamlSchemas.length === 0 ||
      !wasHighlightEnabledRef.current ||
      !hasInitialValidationPassRef.current ||
      !completedInitialPassWithoutYamlSchemaRef.current
    ) {
      return;
    }

    completedInitialPassWithoutYamlSchemaRef.current = false;
    void runValidationRef.current();
  }, [highlightValidationErrors, isEditorMounted, monacoYamlSchemas]);

  useEffect(() => {
    if (!highlightValidationErrors || !isEditorMounted) {
      return;
    }

    const editor = getActiveEditor();
    const model = editor?.getModel();
    if (!model) {
      return;
    }

    const modelUri = model.uri?.toString();
    if (!modelUri) {
      return;
    }

    const disposable = monaco.editor.onDidChangeMarkers((changedUris) => {
      if (!hasInitialValidationPassRef.current) {
        return;
      }

      if (!changedUris.some((uri) => uri.toString() === modelUri)) {
        return;
      }

      schedulePublishValidationResults(customValidationResultsRef.current);
    });

    return () => disposable.dispose();
  }, [
    getActiveEditor,
    highlightValidationErrors,
    isEditorMounted,
    schedulePublishValidationResults,
  ]);

  useDebounce(
    () => {
      if (!highlightValidationErrors || !isEditorMounted) {
        return;
      }

      void runValidationRef.current();
    },
    WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS,
    [isEditorMounted, validationYaml]
  );

  const handleValidationErrorClick = useCallback(
    (error: YamlValidationResult) => {
      const editor = getActiveEditor();
      if (!editor || error.startLineNumber <= 0) {
        return;
      }

      navigateToErrorPosition(editor, error.startLineNumber, error.startColumn);
    },
    [getActiveEditor]
  );

  return {
    validationResults,
    isValidationLoading:
      isValidationLoading || (highlightValidationErrors && !hasInitialValidationPass),
    handleValidationErrorClick,
  };
};
