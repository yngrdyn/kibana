/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SchemasSettings } from 'monaco-yaml';
import { monaco } from '@kbn/code-editor';
import {
  WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS,
  WORKFLOW_CHANGE_HISTORY_VALIDATION_MARKER_MAX_WAIT_MS,
} from './workflow_change_history_preview_constants';
import { yamlLanguageService } from '../../shared/ui/yaml_editor/yaml_language_service';

/**
 * Waits for a post-update marker change on the model (debounced), or until
 * {@link WORKFLOW_CHANGE_HISTORY_VALIDATION_MARKER_MAX_WAIT_MS} elapses.
 *
 * Does not short-circuit on cached yaml markers — callers must run this only
 * after `yamlLanguageService.update` so we wait for the validation pass tied
 * to the current schema fingerprint, not markers left from a prior highlight
 * session. Late markers after max-wait are merged by the hook's republish listener.
 */
const waitForDebouncedMarkerSettle = (
  model: monaco.editor.ITextModel,
  signal: AbortSignal
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const modelUri = model.uri.toString();
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let maxWaitTimeout: ReturnType<typeof setTimeout> | null = null;
    let markerListener: monaco.IDisposable | undefined;

    const cleanup = (): void => {
      markerListener?.dispose();
      markerListener = undefined;
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }
      if (maxWaitTimeout) {
        clearTimeout(maxWaitTimeout);
        maxWaitTimeout = null;
      }
      signal.removeEventListener('abort', onAbort);
    };

    const settle = (): void => {
      debounceTimeout = setTimeout(() => {
        cleanup();
        resolve();
      }, WORKFLOW_CHANGE_HISTORY_VALIDATION_DEBOUNCE_MS);
    };

    const onAbort = (): void => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    markerListener = monaco.editor.onDidChangeMarkers((changedUris) => {
      if (!changedUris.some((uri) => uri.toString() === modelUri)) {
        return;
      }

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      settle();
    });

    signal.addEventListener('abort', onAbort);

    maxWaitTimeout = setTimeout(() => {
      cleanup();
      resolve();
    }, WORKFLOW_CHANGE_HISTORY_VALIDATION_MARKER_MAX_WAIT_MS);
  });

/**
 * Ensures monaco-yaml schema validation has settled on the model before the first
 * accordion publish. Prevents a transient "No validation errors" state when custom
 * validation finishes before async yaml schema markers are published.
 *
 * Schema registration runs here (single SSOT) — do not call `yamlLanguageService.update`
 * elsewhere in the preview validation path.
 */
export const waitForYamlSchemaMarkersAfterUpdate = async (
  model: monaco.editor.ITextModel,
  schemas: SchemasSettings[],
  signal: AbortSignal
): Promise<void> => {
  if (schemas.length === 0) {
    return;
  }

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  await yamlLanguageService.update(schemas);

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  await waitForDebouncedMarkerSettle(model, signal);
};
