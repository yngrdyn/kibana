/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { FtrProviderContext } from '../../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const PageObjects = getPageObjects(['security']);
  const esArchiver = getService('esArchiver');
  const logsUi = getService('logsUi');
  const retry = getService('retry');
  const security = getService('security');

  describe('Log Entry Rate Tab', function () {
    this.tags('includeFirefox');

    const loginWithMLPrivileges = async (privileges: Record<string, string[]>) => {
      await security.role.create('global_logs_role', {
        elasticsearch: {
          cluster: ['all'],
          indices: [{ names: ['*'], privileges: ['read', 'view_index_metadata'] }],
        },
        kibana: [
          {
            feature: {
              logs: ['read'],
              ...privileges,
            },
            spaces: ['*'],
          },
        ],
      });

      await security.user.create('global_logs_read_user', {
        password: 'global_logs_read_user-password',
        roles: ['global_logs_role'],
        full_name: 'logs test user',
      });

      await PageObjects.security.forceLogout();

      await PageObjects.security.login('global_logs_read_user', 'global_logs_read_user-password', {
        expectSpaceSelector: false,
      });
    };

    const logoutAndDeleteUser = async () => {
      await PageObjects.security.forceLogout();
      await Promise.all([
        security.role.delete('global_logs_role'),
        security.user.delete('global_logs_read_user'),
      ]);
    };

    describe('with a trial license', () => {
      before(() => logsUi.cleanIndices());

      it('shows no data page when indices do not exist', async () => {
        await logsUi.logEntryRatePage.navigateTo();

        await retry.try(async () => {
          expect(await logsUi.logEntryRatePage.getNoDataScreen()).to.be.ok();
        });
      });

      describe('when indices exists', () => {
        before(async () => {
          await esArchiver.load(
            'x-pack/solutions/observability/test/fixtures/es_archives/infra/metrics_and_logs'
          );
        });

        after(async () => {
          await esArchiver.unload(
            'x-pack/solutions/observability/test/fixtures/es_archives/infra/metrics_and_logs'
          );
        });

        it('shows setup page when indices exist', async () => {
          await logsUi.logEntryRatePage.navigateTo();

          await retry.try(async () => {
            expect(await logsUi.logEntryRatePage.getSetupScreen()).to.be.ok();
          });
        });

        it('shows required ml read privileges prompt when the user has not any ml privileges', async () => {
          await loginWithMLPrivileges({});
          await logsUi.logEntryRatePage.navigateTo();

          await retry.try(async () => {
            expect(await logsUi.logEntryRatePage.getNoMlReadPrivilegesPrompt()).to.be.ok();
          });
          await logoutAndDeleteUser();
        });

        it('shows required ml all privileges prompt when the user has only ml read privileges', async () => {
          await loginWithMLPrivileges({ ml: ['read'] });
          await logsUi.logEntryRatePage.navigateTo();

          await retry.try(async () => {
            expect(await logsUi.logEntryRatePage.getNoMlAllPrivilegesPrompt()).to.be.ok();
          });
          await logoutAndDeleteUser();
        });
      });
    });
  });
};
