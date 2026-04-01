/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, LineCounter } from 'yaml';
import { isScalar, visit } from 'yaml';
import { getPathFromAncestors } from '../../../../common/lib/yaml';

export interface AllowRecursiveTriggersItem {
  triggerIndex: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  yamlPath: ReadonlyArray<string | number>;
}

function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const lines = text.substring(0, offset).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

/** Path is triggers[n].on.allowRecursiveTriggers → returns n; otherwise null. */
function getTriggerIndexIfAllowRecursiveTriggersPath(
  path: ReadonlyArray<string | number>
): number | null {
  if (
    path.length < 4 ||
    path[0] !== 'triggers' ||
    typeof path[1] !== 'number' ||
    path[2] !== 'on' ||
    path[3] !== 'allowRecursiveTriggers'
  ) {
    return null;
  }
  return path[1];
}

/**
 * Collects trigger `on.allowRecursiveTriggers: true` nodes for editor validation
 * (recursive / cyclic trigger paths).
 *
 * @param lineCounter - When provided, must be the same `LineCounter` passed to `parseDocument`
 *   for the current YAML string. Offsets in node `range` are only valid for that source;
 *   using `yamlDocument.toString()` for line/column breaks after round-trip serialization.
 */
export const collectAllowRecursiveTriggersItems = (
  yamlDocument: Document,
  lineCounter?: LineCounter
): AllowRecursiveTriggersItem[] => {
  const items: AllowRecursiveTriggersItem[] = [];

  if (!yamlDocument?.contents || yamlDocument.errors.length > 0) {
    return items;
  }

  const fallbackText = yamlDocument.toString();

  visit(yamlDocument, {
    Pair(_key, pair, ancestors) {
      if (!isScalar(pair.key) || pair.key.value !== 'allowRecursiveTriggers' || !pair.key.range) {
        return;
      }
      const parentPath = getPathFromAncestors(ancestors);
      const path = [...parentPath, pair.key.value as string];
      const triggerIndex = getTriggerIndexIfAllowRecursiveTriggersPath(path);
      if (triggerIndex === null) {
        return;
      }

      const valueNode = pair.value;
      if (
        !valueNode ||
        !isScalar(valueNode) ||
        typeof valueNode.value !== 'boolean' ||
        valueNode.value !== true ||
        !valueNode.range
      ) {
        return;
      }

      // Highlight from the key through the end of the `true` token.
      // Use value-end (range[1]), not node-end (range[2]), so the span does not
      // absorb trailing newline / following tokens (avoids squiggles on the next line).
      const startOffset = pair.key.range[0];
      const endOffset = valueNode.range[1];

      if (lineCounter) {
        const startPos = lineCounter.linePos(startOffset);
        const endPos = lineCounter.linePos(endOffset);
        items.push({
          triggerIndex,
          startLineNumber: startPos.line,
          startColumn: startPos.col,
          endLineNumber: endPos.line,
          endColumn: endPos.col,
          yamlPath: path,
        });
      } else {
        const start = offsetToLineColumn(fallbackText, startOffset);
        const end = offsetToLineColumn(fallbackText, endOffset);
        items.push({
          triggerIndex,
          startLineNumber: start.line,
          startColumn: start.column,
          endLineNumber: end.line,
          endColumn: end.column,
          yamlPath: path,
        });
      }
    },
  });

  return items;
};
