/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Document, LineCounter, parseDocument } from 'yaml';
import { collectTriggerReentryItems } from './collect_trigger_reentry_items';

function parse(yaml: string) {
  return parseDocument(yaml);
}

function parseWithLineCounter(yaml: string) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter });
  return { doc, lineCounter };
}

describe('collectTriggerReentryItems', () => {
  it('returns an empty array when the document has no contents', () => {
    const doc = parse('');
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('returns an empty array when the document has null contents', () => {
    const doc = new Document(null);
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('returns an empty array when the document has parse errors', () => {
    const doc = parse(':\n\t- :\n\t\t');
    if (doc.errors.length === 0) {
      doc.errors.push({ code: 'TAB_AS_INDENT', message: 'test error' } as never);
    }
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('returns an empty array when there are no triggers', () => {
    const yaml = `name: my-workflow
steps:
  - name: step1
    type: action`;
    const doc = parse(yaml);
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('returns an empty array when reentry is false', () => {
    const yaml = `triggers:
  - type: alert
    on:
      reentry: false`;
    const doc = parse(yaml);
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('returns an empty array when reentry is a string', () => {
    const yaml = `triggers:
  - type: alert
    on:
      reentry: "true"`;
    const doc = parse(yaml);
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });

  it('collects reentry: true under triggers[].on', () => {
    const yaml = `triggers:
  - type: alert
    on:
      reentry: true`;
    const { doc, lineCounter } = parseWithLineCounter(yaml);
    const items = collectTriggerReentryItems(doc, lineCounter);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      triggerIndex: 0,
      yamlPath: ['triggers', 0, 'on', 'reentry'],
      startLineNumber: 4,
      startColumn: 7,
      endLineNumber: 4,
      endColumn: 20,
    });
  });

  it('collects multiple triggers with reentry true', () => {
    const yaml = `triggers:
  - type: alert
    on:
      reentry: true
  - type: alert
    on:
      reentry: true`;
    const doc = parse(yaml);
    const items = collectTriggerReentryItems(doc);

    expect(items).toHaveLength(2);
    expect(items[0]?.triggerIndex).toBe(0);
    expect(items[1]?.triggerIndex).toBe(1);
  });

  it('does not collect reentry outside triggers[].on', () => {
    const yaml = `reentry: true
triggers:
  - type: alert
    on:
      source: x`;
    const doc = parse(yaml);
    expect(collectTriggerReentryItems(doc)).toEqual([]);
  });
});
