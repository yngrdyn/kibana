/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface LanguageDocumentationSections {
  groups: Array<{
    label: string;
    description?: string;
    items: Array<{ label: string; description?: JSX.Element }>;
  }>;
  initialSection: JSX.Element;
}

export type ESQLSignatureLicenseType = 'PLATINUM' | 'BASIC' | 'GOLD' | 'ENTERPRISE';
export interface Signature {
  params: Array<{
    name: string;
    type: string;
    optional?: boolean;
    supportsWildcard?: boolean;
  }>;
  license?: ESQLSignatureLicenseType;
}

export interface FunctionDefinition {
  signatures: Signature[];
  license?: ESQLSignatureLicenseType;
}
