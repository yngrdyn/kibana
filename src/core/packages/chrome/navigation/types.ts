/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { IconType } from '@elastic/eui';

export interface SecondaryMenuItem {
  'data-test-subj'?: string;
  external?: boolean;
  href: string;
  id: string;
  label: string;
}

export interface SecondaryMenuSection {
  id: string;
  items: SecondaryMenuItem[];
  label: string | null;
}

export interface MenuItem {
  'data-test-subj'?: string;
  href: string;
  iconType?: IconType;
  id: string;
  label: string;
  sections?: SecondaryMenuSection[];
}
export interface NavigationStructure {
  footerItems: MenuItem[];
  primaryItems: MenuItem[];
}

export interface MenuCalculations {
  availableHeight: number;
  itemGap: number;
  maxVisibleItems: number;
}
