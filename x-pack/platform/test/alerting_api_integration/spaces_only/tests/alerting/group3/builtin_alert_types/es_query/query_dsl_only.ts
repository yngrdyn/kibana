/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { pull } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { Spaces } from '../../../../../scenarios';
import type { FtrProviderContext } from '../../../../../../common/ftr_provider_context';
import { getUrlPrefix, ObjectRemover } from '../../../../../../common/lib';
import { createDataStream, deleteDataStream } from '../../../create_test_data';
import type { CreateRuleParams } from './common';
import {
  createConnector,
  ES_GROUPS_TO_WRITE,
  ES_TEST_DATA_STREAM_NAME,
  ES_TEST_INDEX_REFERENCE,
  ES_TEST_INDEX_SOURCE,
  ES_TEST_OUTPUT_INDEX_NAME,
  getRuleServices,
  RULE_INTERVALS_TO_WRITE,
  RULE_INTERVAL_MILLIS,
  RULE_INTERVAL_SECONDS,
  RULE_TYPE_ID,
} from './common';

const TEST_HOSTNAME = 'test.alerting.example.com';

export default function ruleTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const {
    es,
    esTestIndexTool,
    esTestIndexToolOutput,
    createEsDocumentsInGroups,
    waitForDocs,
    waitForAADDocs,
    removeAllAADDocs,
  } = getRuleServices(getService);

  describe('Query DSL only', () => {
    let endDate: string;
    let connectorId: string;
    const objectRemover = new ObjectRemover(supertest);

    beforeEach(async () => {
      await esTestIndexTool.destroy();
      await esTestIndexTool.setup();

      await esTestIndexToolOutput.destroy();
      await esTestIndexToolOutput.setup();

      connectorId = await createConnector(supertest, objectRemover, ES_TEST_OUTPUT_INDEX_NAME);

      // write documents in the future, figure out the end date
      const endDateMillis = Date.now() + (RULE_INTERVALS_TO_WRITE - 1) * RULE_INTERVAL_MILLIS;
      endDate = new Date(endDateMillis).toISOString();

      await createDataStream(es, ES_TEST_DATA_STREAM_NAME);

      await removeAllAADDocs();
    });

    afterEach(async () => {
      await objectRemover.removeAll();
      await esTestIndexTool.destroy();
      await esTestIndexToolOutput.destroy();
      await deleteDataStream(es, ES_TEST_DATA_STREAM_NAME);
      await removeAllAADDocs();
    });

    it(`runs correctly: runtime fields for esQuery search type`, async () => {
      // write documents from now to the future end date in groups
      await createEsDocumentsInGroups(ES_GROUPS_TO_WRITE, endDate);
      await createRule({
        name: 'always fire',
        esQuery: `
          {
            "runtime_mappings": {
                "testedValueSquared": {
                    "type": "long",
                    "script": {
                        "source": "emit(doc['testedValue'].value * doc['testedValue'].value);"
                    }
                },
                "evenOrOdd": {
                    "type": "keyword",
                    "script": {
                        "source": "emit(doc['testedValue'].value % 2 == 0 ? 'even' : 'odd');"
                    }
                }
            },
            "fields": ["testedValueSquared", "evenOrOdd"],
            "query": {
                "match_all": { }
            }
        }`.replace(`"`, `\"`),
        size: 100,
        thresholdComparator: '>',
        threshold: [-1],
      });

      const docs = await waitForDocs(2);
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const { name, title } = doc._source.params;
        expect(name).to.be('always fire');
        expect(title).to.be(`rule 'always fire' matched query`);

        const hits = JSON.parse(doc._source.hits);
        expect(hits).not.to.be.empty();
        hits.forEach((hit: any) => {
          expect(hit.fields).not.to.be.empty();
          expect(hit.fields.testedValueSquared).not.to.be.empty();
          // fields returns as an array of values
          hit.fields.testedValueSquared.forEach((testedValueSquared: number) => {
            expect(hit._source.testedValue * hit._source.testedValue).to.be(testedValueSquared);
          });
          hit.fields.evenOrOdd.forEach((evenOrOdd: string) => {
            expect(hit._source.testedValue % 2 === 0 ? 'even' : 'odd').to.be(evenOrOdd);
          });
        });
      }
    });

    it(`runs correctly: fetches wildcard fields in esQuery search type`, async () => {
      // write documents from now to the future end date in groups
      await createEsDocumentsInGroups(ES_GROUPS_TO_WRITE, endDate);
      await createRule({
        name: 'always fire',
        esQuery: `
          {
            "fields": ["*"],
            "query": {
                "match_all": { }
            }
        }`.replace(`"`, `\"`),
        size: 100,
        thresholdComparator: '>',
        threshold: [-1],
      });

      const docs = await waitForDocs(2);
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const { name, title } = doc._source.params;
        expect(name).to.be('always fire');
        expect(title).to.be(`rule 'always fire' matched query`);

        const hits = JSON.parse(doc._source.hits);
        expect(hits).not.to.be.empty();
        hits.forEach((hit: any) => {
          expect(hit.fields).not.to.be.empty();
          expect(
            pull(
              // remove nested fields
              Object.keys(hit.fields),
              'host.hostname',
              'host.hostname.keyword',
              'host.id',
              'host.name'
            ).sort()
          ).to.eql(Object.keys(hit._source).sort());
        });
      }
    });

    it(`runs correctly: fetches field formatting in esQuery search type`, async () => {
      const reIsNumeric = /^\d+$/;

      // write documents from now to the future end date in groups
      await createEsDocumentsInGroups(ES_GROUPS_TO_WRITE, endDate);
      await createRule({
        name: 'always fire',
        esQuery: `
          {
            "fields": [
              {
                "field": "@timestamp",
                "format": "epoch_millis"
              }
            ],
            "query": {
                "match_all": { }
            }
        }`.replace(`"`, `\"`),
        size: 100,
        thresholdComparator: '>',
        threshold: [-1],
      });

      const docs = await waitForDocs(2);
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const { name, title } = doc._source.params;
        expect(name).to.be('always fire');
        expect(title).to.be(`rule 'always fire' matched query`);

        const hits = JSON.parse(doc._source.hits);
        expect(hits).not.to.be.empty();

        hits.forEach((hit: any) => {
          expect(hit.fields).not.to.be.empty();
          hit.fields['@timestamp'].forEach((timestamp: string) => {
            expect(reIsNumeric.test(timestamp)).to.be(true);
          });
        });
      }
    });

    it(`runs correctly: _source: false field for esQuery search type`, async () => {
      // write documents from now to the future end date in groups
      await createEsDocumentsInGroups(ES_GROUPS_TO_WRITE, endDate);
      await createRule({
        name: 'always fire',
        esQuery: `
          {
            "query": {
                "match_all": { }
            },
            "_source": false
        }`.replace(`"`, `\"`),
        size: 100,
        thresholdComparator: '>',
        threshold: [-1],
      });

      const docs = await waitForDocs(2);
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const { name, title } = doc._source.params;
        expect(name).to.be('always fire');
        expect(title).to.be(`rule 'always fire' matched query`);

        const hits = JSON.parse(doc._source.hits);
        expect(hits).not.to.be.empty();
        hits.forEach((hit: any) => {
          expect(hit._source).to.be(undefined);
        });
      }
    });

    it(`runs correctly: _source field for esQuery search type`, async () => {
      // write documents from now to the future end date in groups
      await createEsDocumentsInGroups(ES_GROUPS_TO_WRITE, endDate);
      await createRule({
        name: 'always fire',
        esQuery: `
          {
            "query": {
                "match_all": { }
            },
            "_source": "testedValue*"
        }`.replace(`"`, `\"`),
        size: 100,
        thresholdComparator: '>',
        threshold: [-1],
      });

      const docs = await waitForDocs(2);
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const { name, title } = doc._source.params;
        expect(name).to.be('always fire');
        expect(title).to.be(`rule 'always fire' matched query`);

        const hits = JSON.parse(doc._source.hits);
        expect(hits).not.to.be.empty();
        hits.forEach((hit: any) => {
          expect(hit._source).not.to.be.empty();
          Object.keys(hit._source).forEach((key) => {
            expect(key.startsWith('testedValue')).to.be(true);
          });
        });
      }
    });

    it(`runs correctly: copies fields from groups into alerts`, async () => {
      const tag = 'example-tag-A';
      const ruleName = 'group by tag';
      await createDocWithTags([tag]);

      await createRule({
        name: ruleName,
        esQuery: JSON.stringify({ query: { match_all: {} } }),
        timeField: '@timestamp',
        size: 100,
        thresholdComparator: '>',
        threshold: [0],
        groupBy: 'top',
        termField: 'tags',
        termSize: 3,
        sourceFields: [{ label: 'host.hostname', searchPath: 'host.hostname.keyword' }],
      });

      const docs = await waitForAADDocs(1);
      const alert = docs[0]._source || {};
      expect(alert['kibana.alert.rule.name']).to.be(ruleName);
      expect(alert['kibana.alert.evaluation.value']).to.be('1');

      // eslint-disable-next-line dot-notation
      const tags = alert['tags'];
      expect(Array.isArray(tags)).to.be(true);
      expect(tags.length).to.be(1);
      expect(tags[0]).to.be(tag);

      const hostname = alert['host.hostname'];
      expect(Array.isArray(hostname)).to.be(true);
      expect(hostname.length).to.be(1);
      expect(hostname[0]).to.be(TEST_HOSTNAME);
    });

    async function createRule(params: CreateRuleParams): Promise<string> {
      const action = {
        id: connectorId,
        group: 'query matched',
        params: {
          documents: [
            {
              source: ES_TEST_INDEX_SOURCE,
              reference: ES_TEST_INDEX_REFERENCE,
              params: {
                name: '{{{rule.name}}}',
                value: '{{{context.value}}}',
                title: '{{{context.title}}}',
                message: '{{{context.message}}}',
              },
              // wrap in brackets
              hits: '[{{context.hits}}]',
              date: '{{{context.date}}}',
              previousTimestamp: '{{{state.latestTimestamp}}}',
            },
          ],
        },
      };

      const recoveryAction = {
        id: connectorId,
        group: 'recovered',
        params: {
          documents: [
            {
              source: ES_TEST_INDEX_SOURCE,
              reference: ES_TEST_INDEX_REFERENCE,
              params: {
                name: '{{{rule.name}}}',
                value: '{{{context.value}}}',
                title: '{{{context.title}}}',
                message: '{{{context.message}}}',
              },
              // wrap in brackets
              hits: '[{{context.hits}}]',
              date: '{{{context.date}}}',
            },
          ],
        },
      };

      const ruleParams =
        params.searchType === 'searchSource'
          ? {
              searchConfiguration: params.searchConfiguration,
            }
          : {
              index: [params.indexName || ES_TEST_INDEX_NAME],
              timeField: params.timeField || 'date',
              esQuery: params.esQuery,
            };

      const response = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: params.name,
          consumer: 'alerts',
          enabled: true,
          rule_type_id: RULE_TYPE_ID,
          schedule: { interval: `${RULE_INTERVAL_SECONDS}s` },
          actions: [action, recoveryAction],
          notify_when: params.notifyWhen || 'onActiveAlert',
          params: {
            size: params.size,
            timeWindowSize: params.timeWindowSize || RULE_INTERVAL_SECONDS * 5,
            timeWindowUnit: 's',
            thresholdComparator: params.thresholdComparator,
            threshold: params.threshold,
            searchType: params.searchType,
            aggType: params.aggType || 'count',
            groupBy: params.groupBy || 'all',
            termField: params.termField,
            termSize: params.termSize,
            sourceFields: params.sourceFields,
            ...ruleParams,
          },
        });

      const { body: createdRule, statusCode } = response;
      expect(statusCode).to.be(200);

      const ruleId = createdRule.id;
      objectRemover.add(Spaces.space1.id, ruleId, 'rule', 'alerting');

      return ruleId;
    }

    async function createDocWithTags(tags: string[]) {
      const document = {
        '@timestamp': new Date().toISOString(),
        tags,
        host: {
          hostname: TEST_HOSTNAME,
        },
      };

      const response = await es.index({
        id: uuidv4(),
        index: ES_TEST_INDEX_NAME,
        refresh: 'wait_for',
        op_type: 'create',
        body: document,
      });

      if (response.result !== 'created') {
        throw new Error(`document not created: ${JSON.stringify(response)}`);
      }
    }
  });
}
