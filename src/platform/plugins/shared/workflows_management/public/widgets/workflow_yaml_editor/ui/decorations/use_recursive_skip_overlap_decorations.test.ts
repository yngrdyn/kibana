/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import { LineCounter, parseDocument } from 'yaml';
import type { monaco } from '@kbn/monaco';
import { useRecursiveSkipOverlapDecorations } from './use_recursive_skip_overlap_decorations';

jest.mock('@kbn/monaco', () => {
  const actualMonaco = jest.requireActual('@kbn/monaco');
  return {
    ...actualMonaco,
    monaco: {
      ...actualMonaco.monaco,
      Range: jest.fn((startLine: number, startCol: number, endLine: number, endCol: number) => ({
        startLineNumber: startLine,
        startColumn: startCol,
        endLineNumber: endLine,
        endColumn: endCol,
      })),
    },
  };
});

const createMockModel = (value: string) => {
  const lines = value.split('\n');
  return {
    getValue: jest.fn(() => value),
    getLineContent: jest.fn((lineNum: number) => lines[lineNum - 1] ?? ''),
    getLineMaxColumn: jest.fn((lineNum: number) => (lines[lineNum - 1]?.length ?? 0) + 1),
    getPositionAt: jest.fn((offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) {
          return { lineNumber: i + 1, column: remaining + 1 };
        }
        remaining -= lines[i].length + 1;
      }
      return { lineNumber: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
    }),
  } as unknown as monaco.editor.ITextModel;
};

const createMockEditor = (value: string) => {
  const model = createMockModel(value);
  const decorationsCollection = {
    clear: jest.fn(),
    set: jest.fn(),
  };
  return {
    editor: {
      createDecorationsCollection: jest.fn(() => decorationsCollection),
      getModel: jest.fn(() => model),
    } as unknown as monaco.editor.IStandaloneCodeEditor,
    decorationsCollection,
  };
};

describe('useRecursiveSkipOverlapDecorations', () => {
  it('does not create decorations when readOnly is true', () => {
    const yamlString = [
      'triggers:',
      '  - type: example.loopTrigger',
      '    on:',
      '      allowRecursiveTriggers: true',
    ].join('\n');
    const doc = parseDocument(yamlString, { keepSourceTokens: true });
    const { editor } = createMockEditor(yamlString);

    renderHook(() =>
      useRecursiveSkipOverlapDecorations({
        editor,
        yamlDocument: doc,
        yamlLineCounter: undefined,
        isEditorMounted: true,
        readOnly: true,
      })
    );

    expect(editor.createDecorationsCollection).not.toHaveBeenCalled();
  });

  it('creates a glyph on the allowRecursiveTriggers line when only that flag is set', () => {
    const yamlString = [
      'triggers:',
      '  - type: example.loopTrigger',
      '    on:',
      '      allowRecursiveTriggers: true',
    ].join('\n');
    const lineCounter = new LineCounter();
    const doc = parseDocument(yamlString, { lineCounter, keepSourceTokens: true });
    const { editor } = createMockEditor(yamlString);

    renderHook(() =>
      useRecursiveSkipOverlapDecorations({
        editor,
        yamlDocument: doc,
        yamlLineCounter: lineCounter,
        isEditorMounted: true,
        readOnly: false,
      })
    );

    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1);
    const decorations = (editor.createDecorationsCollection as jest.Mock).mock.calls[0][0];
    expect(decorations).toHaveLength(1);
    expect(decorations[0].options.glyphMarginClassName).toBe('workflow-trigger-on-chain-glyph');
    expect(decorations[0].range.startLineNumber).toBe(4);
    expect(decorations[0].options.glyphMarginHoverMessage?.value).toContain('Recursive');
  });

  it('creates a glyph on the skipWorkflowEmits line when only that flag is set', () => {
    const yamlString = [
      'triggers:',
      '  - type: example.loopTrigger',
      '    on:',
      '      skipWorkflowEmits: true',
    ].join('\n');
    const lineCounter = new LineCounter();
    const doc = parseDocument(yamlString, { lineCounter, keepSourceTokens: true });
    const { editor } = createMockEditor(yamlString);

    renderHook(() =>
      useRecursiveSkipOverlapDecorations({
        editor,
        yamlDocument: doc,
        yamlLineCounter: lineCounter,
        isEditorMounted: true,
        readOnly: false,
      })
    );

    const decorations = (editor.createDecorationsCollection as jest.Mock).mock.calls[0][0];
    expect(decorations).toHaveLength(1);
    expect(decorations[0].range.startLineNumber).toBe(4);
    expect(decorations[0].options.glyphMarginHoverMessage?.value).toContain('Skip workflow');
  });

  it('still creates a glyph when YAML is parsed without keepSourceTokens (pair range fallback)', () => {
    const yamlString = [
      'triggers:',
      '  - type: example.loopTrigger',
      '    on:',
      '      allowRecursiveTriggers: true',
    ].join('\n');
    const lineCounter = new LineCounter();
    const doc = parseDocument(yamlString, { lineCounter });
    const { editor } = createMockEditor(yamlString);

    renderHook(() =>
      useRecursiveSkipOverlapDecorations({
        editor,
        yamlDocument: doc,
        yamlLineCounter: lineCounter,
        isEditorMounted: true,
        readOnly: false,
      })
    );

    expect(editor.createDecorationsCollection).toHaveBeenCalled();
    const decorations = (editor.createDecorationsCollection as jest.Mock).mock.calls[0][0];
    expect(decorations.length).toBeGreaterThanOrEqual(1);
    expect(decorations[0].options.glyphMarginClassName).toBe('workflow-trigger-on-chain-glyph');
  });

  it('creates two glyphs when both flags are set', () => {
    const yamlString = [
      'triggers:',
      '  - type: example.loopTrigger',
      '    on:',
      '      allowRecursiveTriggers: true',
      '      skipWorkflowEmits: true',
    ].join('\n');
    const lineCounter = new LineCounter();
    const doc = parseDocument(yamlString, { lineCounter, keepSourceTokens: true });
    const { editor } = createMockEditor(yamlString);

    renderHook(() =>
      useRecursiveSkipOverlapDecorations({
        editor,
        yamlDocument: doc,
        yamlLineCounter: lineCounter,
        isEditorMounted: true,
        readOnly: false,
      })
    );

    const decorations = (editor.createDecorationsCollection as jest.Mock).mock.calls[0][0];
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range.startLineNumber).toBe(4);
    expect(decorations[1].range.startLineNumber).toBe(5);
    expect(decorations[0].options.glyphMarginHoverMessage?.value).toContain('both');
  });
});
