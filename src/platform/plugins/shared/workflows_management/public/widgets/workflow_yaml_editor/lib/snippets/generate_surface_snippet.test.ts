/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('./generate_trigger_snippet', () => ({
  generateTriggerSnippet: jest.fn(() => 'mock-snippet'),
}));

import { generateSurfaceSnippet, generateSurfaceSnippetFromSurface } from './generate_surface_snippet';
import { generateTriggerSnippet } from './generate_trigger_snippet';

describe('generateSurfaceSnippet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to generateTriggerSnippet using the surface id', () => {
    const options = { full: true, defaultConnectorId: 'sales-ingress' };

    expect(generateSurfaceSnippet('inboundWebhook.received', options)).toBe('mock-snippet');
    expect(generateTriggerSnippet).toHaveBeenCalledWith('inboundWebhook.received', options);
  });

  it('delegates from a resolved workflow surface definition', () => {
    generateSurfaceSnippetFromSurface({ id: 'inboundWebhook.received' }, { full: true });

    expect(generateTriggerSnippet).toHaveBeenCalledWith('inboundWebhook.received', { full: true });
  });
});
