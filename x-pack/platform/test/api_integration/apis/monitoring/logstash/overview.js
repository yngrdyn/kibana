/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import overviewFixture from './fixtures/overview.json';

export default function ({ getService }) {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');

  describe('overview', () => {
    const archive = 'x-pack/platform/test/fixtures/es_archives/monitoring/logstash_pipelines';
    const timeRange = {
      min: '2018-01-22T09:33:13.000Z',
      max: '2018-01-22T09:41:04.000Z',
    };

    before('load archive', () => {
      return esArchiver.load(archive);
    });

    after('unload archive', () => {
      return esArchiver.unload(archive);
    });

    it('should summarize two Logstash nodes with metrics', async () => {
      const { body } = await supertest
        .post('/api/monitoring/v1/clusters/1rhApLfQShSh3JsNqYCkmA/logstash')
        .set('kbn-xsrf', 'xxx')
        .send({ timeRange })
        .expect(200);

      expect(body).to.eql(overviewFixture);
    });
  });
}
