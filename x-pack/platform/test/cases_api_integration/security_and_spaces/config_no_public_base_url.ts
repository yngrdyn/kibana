/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../common/config';

export default createTestConfig('security_and_spaces', {
  license: 'trial',
  ssl: true,
  testFiles: [require.resolve('./tests/no_public_base_url')],
  publicBaseUrl: false,
});
