/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { FtrProviderContext } from '../../../ftr_provider_context';
import { USER } from '../../../services/ml/security_common';
import { getCommonRequestHeader } from '../../../services/ml/common_api';

const moduleIds = [
  'apache_data_stream',
  'apache_ecs',
  'apm_transaction',
  'auditbeat_process_docker_ecs',
  'logs_ui_analysis',
  'logs_ui_categories',
  'metricbeat_system_ecs',
  'metrics_ui_hosts',
  'metrics_ui_k8s',
  'nginx_data_stream',
  'nginx_ecs',
  'sample_data_ecommerce',
  'sample_data_weblogs',
  'security_auth',
  'security_cloudtrail',
  'security_host',
  'security_linux_v3',
  'security_network',
  'security_packetbeat',
  'security_windows_v3',
  'uptime_heartbeat',
];

const securityModuleIds = [
  'auditbeat_process_docker_ecs',
  'logs_ui_analysis',
  'logs_ui_categories',
  'security_auth',
  'security_cloudtrail',
  'security_host',
  'security_linux_v3',
  'security_network',
  'security_packetbeat',
  'security_windows_v3',
];

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertestWithoutAuth');
  const ml = getService('ml');

  async function executeGetModuleRequest(
    module: string,
    filter: string[],
    user: USER,
    rspCode: number
  ) {
    const { body, status } = await supertest
      .get(`/internal/ml/modules/get_module/${module}`)
      .query({
        filter: filter.length ? filter.join(',') : undefined,
      })
      .auth(user, ml.securityCommon.getPasswordForUser(user))
      .set(getCommonRequestHeader('1'));
    ml.api.assertResponseStatusCode(rspCode, status, body);

    return body;
  }

  describe('get_module', function () {
    before(async () => {
      await ml.testResources.setKibanaTimeZoneToUTC();
    });

    it('lists all modules', async () => {
      const rspBody = await executeGetModuleRequest('', [], USER.ML_POWERUSER, 200);
      expect(rspBody).to.be.an(Array);

      const responseModuleIds = rspBody.map((module: { id: string }) => module.id);
      expect(responseModuleIds).to.eql(moduleIds);
    });

    it('lists all security modules', async () => {
      const rspBody = await executeGetModuleRequest('', ['security'], USER.ML_POWERUSER, 200);
      expect(rspBody).to.be.an(Array);

      const responseModuleIds = rspBody.map((module: { id: string }) => module.id);
      expect(responseModuleIds).to.eql(securityModuleIds);
    });

    it('cannot find non-security job', async () => {
      await executeGetModuleRequest('apm_transaction', ['security'], USER.ML_POWERUSER, 404);
    });

    for (const moduleId of moduleIds) {
      it(`loads module ${moduleId}`, async () => {
        const rspBody = await executeGetModuleRequest(moduleId, [], USER.ML_POWERUSER, 200);
        expect(rspBody).to.be.an(Object);

        expect(rspBody).to.have.property('id').a('string');
        expect(rspBody).to.have.property('title').a('string');
        expect(rspBody).to.have.property('description').a('string');
        expect(rspBody).to.have.property('type').a('string');
        if (isPopulatedObject(rspBody, ['logoFile'])) {
          expect(rspBody).to.have.property('logoFile').a('string');
        }
        if (isPopulatedObject(rspBody, ['logo'])) {
          expect(rspBody).to.have.property('logo').an(Object);
        }
        if (isPopulatedObject(rspBody, ['defaultIndexPattern'])) {
          expect(rspBody).to.have.property('defaultIndexPattern').a('string');
        }
        if (isPopulatedObject(rspBody, ['query'])) {
          expect(rspBody).to.have.property('query').an(Object);
        }
        if (isPopulatedObject(rspBody, ['jobs'])) {
          expect(rspBody).to.have.property('jobs').an(Object);
        }
        if (isPopulatedObject(rspBody, ['datafeeds'])) {
          expect(rspBody).to.have.property('datafeeds').an(Object);
        }
        if (isPopulatedObject(rspBody, ['kibana'])) {
          expect(rspBody).to.have.property('kibana').an(Object);
        }

        expect(rspBody.id).to.eql(moduleId);
      });
    }
  });
};
