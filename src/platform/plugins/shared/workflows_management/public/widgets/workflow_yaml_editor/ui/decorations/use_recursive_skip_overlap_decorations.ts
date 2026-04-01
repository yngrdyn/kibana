/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useRef } from 'react';
import type { Document, LineCounter, Node, Pair, Scalar, YAMLMap } from 'yaml';
import { isScalar } from 'yaml';
import { i18n } from '@kbn/i18n';
import { monaco } from '@kbn/monaco';
import {
  getTriggerNodes,
  getTriggerOnChainOptionPairs,
  triggerMapHasRecursiveSkipOverlapOn,
} from '../../../../../common/lib/yaml';
import { getMonacoRangeFromYamlNode } from '../../lib/utils';

/**
 * `Pair` nodes often have no `range`; key/value scalars do. Prefer the same `LineCounter` used when
 * parsing the document (matches validation). Fall back to Monaco offsets, then scanning the trigger block.
 */
function resolveChainOptionPropertyLine(
  model: monaco.editor.ITextModel,
  triggerNode: YAMLMap,
  pair: Pair<Scalar, Scalar>,
  yamlLineCounter: LineCounter | undefined
): number | null {
  if (yamlLineCounter && isScalar(pair.key) && pair.key.range) {
    const startOffset = pair.key.range[0];
    const pos = yamlLineCounter.linePos(startOffset);
    if (typeof pos.line === 'number' && pos.line >= 1) {
      return pos.line;
    }
  }

  const pairRange = getMonacoRangeFromYamlNode(model, pair as unknown as Node);
  if (pairRange) {
    return pairRange.startLineNumber;
  }

  if (isScalar(pair.key)) {
    const keyRange = getMonacoRangeFromYamlNode(model, pair.key as unknown as Node);
    if (keyRange) {
      return keyRange.startLineNumber;
    }
  }

  const propertyKey = typeof pair.key.value === 'string' ? pair.key.value : '';
  if (propertyKey === '') {
    return null;
  }

  const triggerRange = getMonacoRangeFromYamlNode(model, triggerNode as unknown as Node);
  if (!triggerRange) {
    return null;
  }

  const needle = `${propertyKey}:`;
  for (let line = triggerRange.startLineNumber; line <= triggerRange.endLineNumber; line++) {
    if (model.getLineContent(line).includes(needle)) {
      return line;
    }
  }

  return null;
}

interface UseRecursiveSkipOverlapDecorationsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  yamlDocument: Document | null;
  /** Same counter as `parseDocument(..., { lineCounter })` in workflow computation; aligns glyphs with markers. */
  yamlLineCounter: LineCounter | undefined;
  isEditorMounted: boolean;
  readOnly: boolean;
}

function glyphHoverForPair(propertyKey: string, triggerHasOverlap: boolean): { value: string } {
  if (triggerHasOverlap) {
    return {
      value: i18n.translate(
        'workflows.workflowDetail.yamlEditor.recursiveSkipOverlapGlyphTooltip',
        {
          defaultMessage:
            'This trigger sets both allowRecursiveTriggers and skipWorkflowEmits. Workflow-emitted events are skipped, so recursive scheduling cannot apply to those emits. Consider using only one of these options.',
        }
      ),
    };
  }
  if (propertyKey === 'allowRecursiveTriggers') {
    return {
      value: i18n.translate(
        'workflows.workflowDetail.yamlEditor.allowRecursiveTriggersGlyphTooltip',
        {
          defaultMessage:
            'Recursive triggers: this workflow may run again when downstream events loop back. Only enable if intentional; otherwise runs may repeat until max event chain depth.',
        }
      ),
    };
  }
  return {
    value: i18n.translate('workflows.workflowDetail.yamlEditor.skipWorkflowEmitsGlyphTooltip', {
      defaultMessage:
        'Skip workflow emits: this workflow is not scheduled when the event is emitted from another workflow execution. Non-workflow events still run it.',
    }),
  };
}

export const useRecursiveSkipOverlapDecorations = ({
  editor,
  yamlDocument,
  yamlLineCounter,
  isEditorMounted,
  readOnly,
}: UseRecursiveSkipOverlapDecorationsProps) => {
  const decorationCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const model = editor?.getModel() ?? null;
    if (decorationCollectionRef.current) {
      decorationCollectionRef.current.clear();
    }

    if (!model || !yamlDocument || !isEditorMounted || readOnly || !editor) {
      return;
    }

    const triggerNodes = getTriggerNodes(yamlDocument);
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const { node } of triggerNodes) {
      const pairs = getTriggerOnChainOptionPairs(node);
      const triggerHasOverlap = triggerMapHasRecursiveSkipOverlapOn(node);

      for (const pair of pairs) {
        const lineNumber = resolveChainOptionPropertyLine(model, node, pair, yamlLineCounter);
        if (lineNumber !== null) {
          const propertyKey =
            typeof pair.key.value === 'string' ? pair.key.value : 'skipWorkflowEmits';

          decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
            options: {
              glyphMarginClassName: 'workflow-trigger-on-chain-glyph',
              glyphMarginHoverMessage: glyphHoverForPair(propertyKey, triggerHasOverlap),
            },
          });
        }
      }
    }

    if (decorations.length > 0 && editor) {
      const createDecorations = () => {
        if (editor) {
          decorationCollectionRef.current = editor.createDecorationsCollection(decorations);
        }
      };

      try {
        createDecorations();
      } catch {
        setTimeout(createDecorations, 10);
      }
    }
  }, [isEditorMounted, yamlDocument, yamlLineCounter, readOnly, editor]);

  return { decorationCollectionRef };
};
