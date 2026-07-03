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
import { waitForPreviewYamlSchemaMarkers } from './wait_for_yaml_schema_markers_after_update';
import { WORKFLOW_CHANGE_HISTORY_VALIDATION_MARKER_REUSE_MAX_WAIT_MS } from './workflow_change_history_preview_constants';
import type { WorkflowChangeHistoryCompareMode } from './workflow_change_history_preview_settings_popover';
import { getWorkflowZodSchema } from '../../../common/schema';
import { useAvailableConnectors } from '../../entities/connectors/model/use_available_connectors';
import { triggerSchemas } from '../../trigger_schemas';
import { navigateToErrorPosition } from '../../widgets/workflow_yaml_editor/lib/utils';
import { getWorkflowValidationDisplayOptions } from '../../widgets/workflow_yaml_editor/lib/workflow_monaco_layout_options';
import type { YamlValidationResult } from '../validate_workflow_yaml/model/types';
import { validationResultFingerprint } from '../validate_workflow_yaml/model/types';
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

const validationResultsFingerprint = (results: YamlValidationResult[]): string =>
  results.map(validationResultFingerprint).sort().join('\n');

const getYamlOwnerMarkersFingerprint = (model: monaco.editor.ITextModel): string => {
  const modelUri = model.uri.toString();
  let markers = monaco.editor.getModelMarkers({ resource: model.uri, owner: 'yaml' });

  if (markers.length === 0) {
    markers = monaco.editor
      .getModelMarkers({ owner: 'yaml' })
      .filter((marker) => marker.resource.toString() === modelUri);
  }

  return markers
    .map(
      (marker) =>
        `${marker.startLineNumber}:${marker.startColumn}:${marker.endLineNumber}:${marker.endColumn}:${marker.severity}:${marker.message}`
    )
    .sort()
    .join('\n');
};

const modelHasYamlOwnerMarkers = (model: monaco.editor.ITextModel): boolean =>
  getYamlOwnerMarkersFingerprint(model).length > 0;

const getPreviewSchemasFingerprint = (schemas: SchemasSettings[]): string =>
  JSON.stringify(schemas);

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
  const [customValidationResults, setCustomValidationResults] = useState<YamlValidationResult[]>(
    []
  );
  const [yamlSchemaResults, setYamlSchemaResults] = useState<YamlValidationResult[]>([]);
  const [isValidationLoading, setIsValidationLoading] = useState(false);
  const [hasInitialValidationPass, setHasInitialValidationPass] = useState(false);
  const hasInitialValidationPassRef = useRef(false);
  const customValidationResultsRef = useRef<YamlValidationResult[]>([]);
  const yamlSchemaResultsRef = useRef<YamlValidationResult[]>([]);
  const computedYamlDocumentRef = useRef<Document | null>(null);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const lastAppliedHighlightsFingerprintRef = useRef('');
  const lastPublishedYamlFingerprintRef = useRef('');
  const lastYamlMarkersFingerprintRef = useRef('');
  const markerSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingHighlightsRef = useRef(false);
  const wasHighlightEnabledRef = useRef(false);
  const highlightValidationErrorsRef = useRef(highlightValidationErrors);
  highlightValidationErrorsRef.current = highlightValidationErrors;
  const completedInitialPassWithoutYamlSchemaRef = useRef(false);
  const previousValidationYamlRef = useRef(validationYaml);
  const registeredPreviewSchemasFingerprintRef = useRef('');

  const { jsonSchema: workflowJsonSchema, uri: workflowSchemaUri } = useWorkflowJsonSchema({
    loose: false,
  });
  const connectorsData = useAvailableConnectors();
  const workflowZodSchema = useMemo(
    () =>
      getWorkflowZodSchema(connectorsData?.connectorTypes ?? {}, triggerSchemas.getRegisteredIds()),
    [connectorsData?.connectorTypes]
  );
  const workflowZodSchemaRef = useRef(workflowZodSchema);
  workflowZodSchemaRef.current = workflowZodSchema;

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

  const validationResults = useMemo(
    () => mergeWorkflowYamlValidationResults(customValidationResults, yamlSchemaResults),
    [customValidationResults, yamlSchemaResults]
  );

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

  const clearScheduledMarkerSync = useCallback(() => {
    if (markerSyncTimeoutRef.current) {
      clearTimeout(markerSyncTimeoutRef.current);
      markerSyncTimeoutRef.current = null;
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

  const resetValidationResultsState = useCallback(() => {
    lastAppliedHighlightsFingerprintRef.current = '';
    lastPublishedYamlFingerprintRef.current = '';
    lastYamlMarkersFingerprintRef.current = '';
    customValidationResultsRef.current = [];
    yamlSchemaResultsRef.current = [];
    computedYamlDocumentRef.current = null;
    setCustomValidationResults([]);
    setYamlSchemaResults([]);
  }, []);

  const syncYamlFooterFromEditor = useCallback(
    (editor?: monaco.editor.IStandaloneCodeEditor | null) => {
      const activeEditor = editor ?? getActiveEditor();
      const model = activeEditor?.getModel();
      if (!model) {
        return;
      }

      lastYamlMarkersFingerprintRef.current = getYamlOwnerMarkersFingerprint(model);
      publishYamlSchemaResultsFromModelRef.current(model, activeEditor);
    },
    [getActiveEditor]
  );

  const applyMergedHighlightsIfNeeded = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (!highlightValidationErrorsRef.current) {
        return;
      }

      const mergedResults = mergeWorkflowYamlValidationResults(
        customValidationResultsRef.current,
        yamlSchemaResultsRef.current
      );
      const highlightsFingerprint = validationResultsFingerprint(mergedResults);

      if (highlightsFingerprint === lastAppliedHighlightsFingerprintRef.current) {
        return;
      }

      lastAppliedHighlightsFingerprintRef.current = highlightsFingerprint;
      isApplyingHighlightsRef.current = true;

      try {
        applyValidationHighlightsToEditor(editor, mergedResults, validationDecorationsRef, {
          omitMarginDecorations: true,
        });
      } finally {
        isApplyingHighlightsRef.current = false;
      }
    },
    [validationDecorationsRef]
  );

  const publishYamlSchemaResultsFromModel = useCallback(
    (model: monaco.editor.ITextModel, editor?: monaco.editor.IStandaloneCodeEditor | null) => {
      if (isApplyingHighlightsRef.current) {
        return;
      }

      try {
        const nextYamlSchemaResults = collectYamlSchemaValidationResults(
          model,
          computedYamlDocumentRef.current,
          workflowZodSchemaRef.current
        );
        const nextFingerprint = validationResultsFingerprint(nextYamlSchemaResults);

        if (nextFingerprint !== lastPublishedYamlFingerprintRef.current) {
          lastPublishedYamlFingerprintRef.current = nextFingerprint;
          lastYamlMarkersFingerprintRef.current = getYamlOwnerMarkersFingerprint(model);
          yamlSchemaResultsRef.current = nextYamlSchemaResults;
          setYamlSchemaResults(nextYamlSchemaResults);
        }

        const activeEditor = editor ?? getActiveEditor();
        if (activeEditor) {
          applyMergedHighlightsIfNeeded(activeEditor);
        }
      } catch {
        // Best-effort marker collection for partial YAML in the diff preview.
      }
    },
    [applyMergedHighlightsIfNeeded, getActiveEditor]
  );

  const publishYamlSchemaResultsFromModelRef = useRef(publishYamlSchemaResultsFromModel);
  publishYamlSchemaResultsFromModelRef.current = publishYamlSchemaResultsFromModel;

  const schedulePublishYamlSchemaResultsFromModel = useCallback(
    (model: monaco.editor.ITextModel) => {
      clearScheduledMarkerSync();
      publishYamlSchemaResultsFromModelRef.current(model);
    },
    [clearScheduledMarkerSync]
  );

  const schedulePublishYamlSchemaResultsFromModelRef = useRef(
    schedulePublishYamlSchemaResultsFromModel
  );
  schedulePublishYamlSchemaResultsFromModelRef.current = schedulePublishYamlSchemaResultsFromModel;

  const finishInitialValidationPass = useCallback(
    (options?: { didWaitForYamlSchema?: boolean }) => {
      if (options?.didWaitForYamlSchema !== undefined) {
        completedInitialPassWithoutYamlSchemaRef.current = !options.didWaitForYamlSchema;
      } else {
        completedInitialPassWithoutYamlSchemaRef.current =
          monacoYamlSchemasRef.current.length === 0;
      }

      completeInitialValidationPass();
      setIsValidationLoading(false);
    },
    [completeInitialValidationPass]
  );

  const waitForYamlSchemaMarkersOnModel = async (
    model: monaco.editor.ITextModel,
    schemas: SchemasSettings[],
    signal: AbortSignal,
    options: { listenerOnly?: boolean } = {}
  ): Promise<boolean> => {
    if (schemas.length === 0 || modelHasYamlOwnerMarkers(model)) {
      return false;
    }

    const schemasFingerprint = getPreviewSchemasFingerprint(schemas);
    const needsSchemaRegistration =
      schemasFingerprint !== registeredPreviewSchemasFingerprintRef.current;

    if (options.listenerOnly && !needsSchemaRegistration) {
      return false;
    }

    await waitForPreviewYamlSchemaMarkers(model, schemas, signal, {
      registerSchemas: needsSchemaRegistration,
      maxWaitMs: needsSchemaRegistration
        ? undefined
        : WORKFLOW_CHANGE_HISTORY_VALIDATION_MARKER_REUSE_MAX_WAIT_MS,
    });

    const registeredFingerprint = registeredPreviewSchemasFingerprintRef.current;
    if (registeredFingerprint !== schemasFingerprint) {
      registeredPreviewSchemasFingerprintRef.current = schemasFingerprint;
    }

    return true;
  };

  const runCustomValidationRef = useRef<() => Promise<void>>(async () => undefined);
  const runValidationRef = useRef<() => Promise<void>>(async () => undefined);
  const validationSequenceRef = useRef(0);

  runCustomValidationRef.current = async () => {
    if (!isEditorMounted || !highlightValidationErrors) {
      return;
    }

    const sequence = ++validationSequenceRef.current;
    const abortController = new AbortController();
    validationAbortControllerRef.current = abortController;

    const editor = getActiveEditor();
    if (!editor || abortController.signal.aborted) {
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

      if (abortController.signal.aborted || sequence !== validationSequenceRef.current) {
        return;
      }

      computedYamlDocumentRef.current = yamlDocument;
      customValidationResultsRef.current = nextValidationResults;
      setCustomValidationResults(nextValidationResults);

      const activeModel = editor.getModel();
      if (activeModel) {
        publishYamlSchemaResultsFromModelRef.current(activeModel, editor);
      } else {
        applyMergedHighlightsIfNeeded(editor);
      }
    } catch (validationError) {
      if (
        abortController.signal.aborted ||
        sequence !== validationSequenceRef.current ||
        (validationError instanceof DOMException && validationError.name === 'AbortError')
      ) {
        return;
      }

      customValidationResultsRef.current = [];
      setCustomValidationResults([]);

      const activeModel = editor.getModel();
      if (activeModel) {
        publishYamlSchemaResultsFromModelRef.current(activeModel, editor);
      } else {
        applyMergedHighlightsIfNeeded(editor);
      }
    }
  };

  runValidationRef.current = async () => {
    if (!isEditorMounted || !highlightValidationErrors) {
      return;
    }

    const sequence = ++validationSequenceRef.current;
    validationAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    validationAbortControllerRef.current = abortController;
    clearScheduledMarkerSync();
    setIsValidationLoading(true);

    const editor = getActiveEditor();
    if (!editor) {
      if (sequence === validationSequenceRef.current) {
        finishInitialValidationPass();
      }
      return;
    }

    if (abortController.signal.aborted) {
      return;
    }

    const yamlToValidate = editor.getModel()?.getValue() ?? validationYaml;
    let didWaitForYamlSchema = false;
    const model = editor.getModel();

    if (model) {
      publishYamlSchemaResultsFromModelRef.current(model, editor);
    }

    try {
      if (model) {
        didWaitForYamlSchema = await waitForYamlSchemaMarkersOnModel(
          model,
          monacoYamlSchemasRef.current,
          abortController.signal,
          {
            listenerOnly: registeredPreviewSchemasFingerprintRef.current.length > 0,
          }
        );

        if (abortController.signal.aborted || sequence !== validationSequenceRef.current) {
          return;
        }

        publishYamlSchemaResultsFromModelRef.current(model, editor);
      }
    } catch (waitError) {
      if (
        abortController.signal.aborted ||
        sequence !== validationSequenceRef.current ||
        (waitError instanceof DOMException && waitError.name === 'AbortError')
      ) {
        return;
      }

      throw waitError;
    }

    if (abortController.signal.aborted || sequence !== validationSequenceRef.current) {
      return;
    }

    finishInitialValidationPass({ didWaitForYamlSchema });

    void runCustomValidationRef.current();
  };

  useEffect(
    () => () => {
      validationAbortControllerRef.current?.abort();
      clearScheduledMarkerSync();
    },
    [clearScheduledMarkerSync]
  );

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

    lastYamlMarkersFingerprintRef.current = getYamlOwnerMarkersFingerprint(model);
    publishYamlSchemaResultsFromModelRef.current(model, editor);

    const disposable = monaco.editor.onDidChangeMarkers((changedUris) => {
      if (isApplyingHighlightsRef.current) {
        return;
      }

      if (!changedUris.some((uri) => uri.toString() === modelUri)) {
        return;
      }

      const yamlMarkersFingerprint = getYamlOwnerMarkersFingerprint(model);
      if (yamlMarkersFingerprint === lastYamlMarkersFingerprintRef.current) {
        return;
      }

      lastYamlMarkersFingerprintRef.current = yamlMarkersFingerprint;
      schedulePublishYamlSchemaResultsFromModelRef.current(model);
    });

    return () => disposable.dispose();
  }, [getActiveEditor, highlightValidationErrors, isEditorMounted, validationYaml]);

  useEffect(() => {
    if (!highlightValidationErrors) {
      wasHighlightEnabledRef.current = false;
      resetInitialValidationPass();
      completedInitialPassWithoutYamlSchemaRef.current = false;
      resetValidationResultsState();
      clearScheduledMarkerSync();
      validationAbortControllerRef.current?.abort();
      setIsValidationLoading(false);
      syncValidationDisplay(false);
      clearEditorValidation();
      return;
    }

    const validationYamlChanged = previousValidationYamlRef.current !== validationYaml;
    const justEnabled = !wasHighlightEnabledRef.current;
    wasHighlightEnabledRef.current = true;

    if (validationYamlChanged) {
      previousValidationYamlRef.current = validationYaml;
      validationAbortControllerRef.current?.abort();
      clearScheduledMarkerSync();
      resetValidationResultsState();
      resetInitialValidationPass();
    }

    if (!isEditorMounted) {
      if (!highlightValidationErrors) {
        return;
      }
      if (validationYamlChanged) {
        setIsValidationLoading(true);
      }
      return;
    }

    syncValidationDisplay(true);

    if (validationYamlChanged && !justEnabled) {
      syncYamlFooterFromEditor();
      finishInitialValidationPass({ didWaitForYamlSchema: false });
      void runCustomValidationRef.current();
      return;
    }

    if (justEnabled || !hasInitialValidationPassRef.current) {
      setIsValidationLoading(true);
      void runValidationRef.current();
    }
  }, [
    clearEditorValidation,
    clearScheduledMarkerSync,
    finishInitialValidationPass,
    getActiveEditor,
    highlightValidationErrors,
    isEditorMounted,
    resetInitialValidationPass,
    resetValidationResultsState,
    syncValidationDisplay,
    syncYamlFooterFromEditor,
    validationYaml,
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
      (isValidationLoading || (highlightValidationErrors && !hasInitialValidationPass)) &&
      validationResults.length === 0,
    handleValidationErrorClick,
  };
};
