/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import { INITIAL_REST_VERSION_INTERNAL } from '@kbn/data-views-plugin/server/constants';
import { FIELDS_FOR_WILDCARD_PATH } from '@kbn/data-views-plugin/common/constants';
import { InternalRequestHeader, RoleCredentials } from '../../../../shared/services';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const randomness = getService('randomness');
  const svlCommonApi = getService('svlCommonApi');
  const svlUserManager = getService('svlUserManager');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  let roleAuthc: RoleCredentials;
  let internalReqHeader: InternalRequestHeader;

  describe('params', () => {
    before(async () => {
      roleAuthc = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
      internalReqHeader = svlCommonApi.getInternalRequestHeader();
      await esArchiver.load(
        'src/platform/test/api_integration/fixtures/es_archiver/index_patterns/basic_index'
      );
    });
    after(async () => {
      await esArchiver.unload(
        'src/platform/test/api_integration/fixtures/es_archiver/index_patterns/basic_index'
      );
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAuthc);
    });

    it('requires a pattern query param', async () => {
      await supertestWithoutAuth
        .get(FIELDS_FOR_WILDCARD_PATH)
        .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
        .set(internalReqHeader)
        .set(roleAuthc.apiKeyHeader)
        .query({})
        .expect(400);
    });

    it('accepts include_unmapped param', async () => {
      await supertestWithoutAuth
        .get(FIELDS_FOR_WILDCARD_PATH)
        .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
        .set(internalReqHeader)
        .set(roleAuthc.apiKeyHeader)
        .query({
          pattern: '*',
          include_unmapped: true,
        })
        .expect(200);
    });

    it('rejects unexpected query params', async () => {
      await supertestWithoutAuth
        .get(FIELDS_FOR_WILDCARD_PATH)
        .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
        .set(internalReqHeader)
        .set(roleAuthc.apiKeyHeader)
        .query({
          pattern: randomness.word(),
          [randomness.word()]: randomness.word(),
        })
        .expect(400);
    });

    describe('fields', () => {
      it('accepts a JSON formatted fields query param', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            fields: JSON.stringify(['baz']),
          })
          .expect(200);
      });

      it('accepts meta_fields query param in string array', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            fields: ['baz', 'foo'],
          })
          .expect(200);
      });

      it('accepts single array fields query param', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            fields: ['baz'],
          })
          .expect(200);
      });

      it('accepts single fields query param', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            fields: 'baz',
          })
          .expect(200);
      });

      it('rejects a comma-separated list of fields', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            fields: 'foo,bar',
          })
          .expect(400);
      });
    });

    describe('meta_fields', () => {
      it('accepts a JSON formatted meta_fields query param', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            meta_fields: JSON.stringify(['meta']),
          })
          .expect(200);
      });

      it('accepts meta_fields query param in string array', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            meta_fields: ['_id', 'meta'],
          })
          .expect(200);
      });

      it('accepts single meta_fields query param', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            meta_fields: ['_id'],
          })
          .expect(200);
      });

      it('rejects a comma-separated list of meta_fields', async () => {
        await supertestWithoutAuth
          .get(FIELDS_FOR_WILDCARD_PATH)
          .set(ELASTIC_HTTP_VERSION_HEADER, INITIAL_REST_VERSION_INTERNAL)
          .set(internalReqHeader)
          .set(roleAuthc.apiKeyHeader)
          .query({
            pattern: '*',
            meta_fields: 'foo,bar',
          })
          .expect(400);
      });
    });
  });
}
