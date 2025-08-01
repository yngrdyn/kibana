/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { SupertestWithRoleScopeType } from '../../services';
import { FtrProviderContext } from '../../ftr_provider_context';

// To test setting validations we are using the existing 'defaultColumns' setting that is available in all serverless projects
// (See list of common serverless settings in /src/platform/packages/private/serverless/settings/common/index.ts)
// The 'defaultColumns' setting is of type array of strings
const DEFAULT_COLUMNS_SETTING = 'defaultColumns';

// We will also create a test setting
const TEST_SETTING = 'testSetting';

export default function ({ getService }: FtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  let supertestAdminWithCookieCredentials: SupertestWithRoleScopeType;

  describe('ui settings service', () => {
    before(async () => {
      supertestAdminWithCookieCredentials = await roleScopedSupertest.getSupertestWithRoleScope(
        'admin',
        {
          useCookieHeader: true,
          withInternalHeaders: true,
        }
      );

      // Creating a test setting
      await supertestAdminWithCookieCredentials
        .post(`/internal/kibana/settings/${TEST_SETTING}`)
        .send({ value: 100 })
        .expect(200);
    });

    // We don't test the public routes as they are not available in serverless
    describe('internal routes', () => {
      describe('get', () => {
        it('returns list of settings', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .get('/internal/kibana/settings')
            .expect(200);

          // The returned list of settings should contain the created test setting
          expect(body).to.have.property('settings');
          expect(body.settings).to.have.property(TEST_SETTING);
        });
      });

      describe('set', () => {
        it('validates value', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/${DEFAULT_COLUMNS_SETTING}`)
            .send({ value: 100 })
            .expect(400);

          expect(body).to.eql({
            statusCode: 400,
            error: 'Bad Request',
            message:
              '[validation [defaultColumns]]: expected value of type [array] but got [number]',
          });
        });

        it('sets value of a setting', async () => {
          await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/${TEST_SETTING}`)
            .send({ value: 999 })
            .expect(200);

          // Verify that the setting has a new value
          const { body } = await supertestAdminWithCookieCredentials
            .get('/internal/kibana/settings')
            .expect(200);

          // The returned list of settings should contain the created test setting
          expect(body.settings[TEST_SETTING].userValue).to.equal(999);
        });
      });

      describe('set many', () => {
        it('validates value', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post('/internal/kibana/settings')
            .send({ changes: { [TEST_SETTING]: 100, [DEFAULT_COLUMNS_SETTING]: 100 } })
            .expect(400);

          expect(body).to.eql({
            statusCode: 400,
            error: 'Bad Request',
            message:
              '[validation [defaultColumns]]: expected value of type [array] but got [number]',
          });
        });

        it('sets values of settings', async () => {
          await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings`)
            .send({ changes: { [TEST_SETTING]: 500 } })
            .expect(200);

          // Verify that the setting has a new value
          const { body } = await supertestAdminWithCookieCredentials
            .get('/internal/kibana/settings')
            .expect(200);

          // The returned list of settings should contain the created test setting
          expect(body.settings[TEST_SETTING].userValue).to.equal(500);
        });
      });

      describe('validate', () => {
        it('returns correct validation error message for invalid value', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/${DEFAULT_COLUMNS_SETTING}/validate`)
            .send({ value: 100 })
            .expect(200);

          expect(body).to.eql({
            valid: false,
            errorMessage: 'expected value of type [array] but got [number]',
          });
        });

        it('returns no validation error message for valid value', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/${DEFAULT_COLUMNS_SETTING}/validate`)
            .send({ value: ['test'] })
            .expect(200);

          expect(body).to.eql({
            valid: true,
          });
        });

        it('returns a 404 for non-existing key', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/nonExisting/validate`)
            .send({ value: ['test'] })
            .expect(404);

          expect(body).to.eql({
            statusCode: 404,
            error: 'Not Found',
            message: 'Setting with a key [nonExisting] does not exist.',
          });
        });

        it('returns a 400 for a null value', async () => {
          const { body } = await supertestAdminWithCookieCredentials
            .post(`/internal/kibana/settings/${DEFAULT_COLUMNS_SETTING}/validate`)
            .send({ value: null })
            .expect(400);

          expect(body).to.eql({
            statusCode: 400,
            error: 'Bad Request',
            message: 'No value was specified.',
          });
        });
      });

      describe('delete', () => {
        it('deletes setting', async () => {
          await supertestAdminWithCookieCredentials
            .delete(`/internal/kibana/settings/${TEST_SETTING}`)
            .expect(200);

          // Verify that the setting is not returned in the Get response anymore
          const { body } = await supertestAdminWithCookieCredentials
            .get('/internal/kibana/settings')
            .expect(200);

          // The returned list of settings should contain the created test setting
          expect(body.settings).to.not.have.property(TEST_SETTING);
        });
      });
    });
  });
}
