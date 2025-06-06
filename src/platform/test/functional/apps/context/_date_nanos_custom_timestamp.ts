/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../ftr_provider_context';

const TEST_INDEX_PATTERN = 'date_nanos_custom_timestamp';
const TEST_DEFAULT_CONTEXT_SIZE = 1;
const TEST_STEP_SIZE = 3;

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const kibanaServer = getService('kibanaServer');
  const dataGrid = getService('dataGrid');
  const security = getService('security');
  const PageObjects = getPageObjects(['common', 'context', 'timePicker', 'discover']);
  const esArchiver = getService('esArchiver');

  describe('context view for date_nanos with custom timestamp', () => {
    before(async function () {
      await security.testUser.setRoles(['kibana_admin', 'kibana_date_nanos_custom']);
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/date_nanos_custom'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/date_nanos_custom'
      );
      await kibanaServer.uiSettings.replace({ defaultIndex: TEST_INDEX_PATTERN });
      await kibanaServer.uiSettings.update({
        'context:defaultSize': `${TEST_DEFAULT_CONTEXT_SIZE}`,
        'context:step': `${TEST_STEP_SIZE}`,
      });
    });

    it('displays predecessors - anchor - successors in right order', async function () {
      await PageObjects.context.navigateTo(TEST_INDEX_PATTERN, '1');
      const actualRowsText = await dataGrid.getRowsText();

      const expectedRowsText = [
        'Oct 21, 2019 @ 08:30:04.828733000',
        'Oct 21, 2019 @ 00:30:04.828740000',
        'Oct 21, 2019 @ 00:30:04.828723000',
      ];
      expect(actualRowsText).to.eql(expectedRowsText);
    });

    after(async function () {
      await security.testUser.restoreDefaults();
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/date_nanos_custom'
      );
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
    });
  });
}
