/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  NetworkQueries,
  NetworkDnsEdges,
  Direction,
  NetworkDnsFields,
  NetworkDnsStrategyResponse,
} from '@kbn/security-solution-plugin/common/search_strategy';
import TestAgent from 'supertest/lib/agent';
import { SearchService } from '@kbn/ftr-common-functional-services';
import { FtrProviderContextWithSpaces } from '../../../../../ftr_provider_context_with_spaces';

export default function ({ getService }: FtrProviderContextWithSpaces) {
  const esArchiver = getService('esArchiver');
  const utils = getService('securitySolutionUtils');

  describe('Network DNS', () => {
    let supertest: TestAgent;
    let search: SearchService;
    describe('With packetbeat', () => {
      before(async () => {
        supertest = await utils.createSuperTest();
        search = await utils.createSearch();
        await esArchiver.load('x-pack/solutions/security/test/fixtures/es_archives/packetbeat/dns');
      });
      after(
        async () =>
          await esArchiver.unload(
            'x-pack/solutions/security/test/fixtures/es_archives/packetbeat/dns'
          )
      );

      const FROM = '2000-01-01T00:00:00.000Z';
      const TO = '3000-01-01T00:00:00.000Z';

      it('Make sure that we get Dns data and sorting by uniqueDomains ascending', async () => {
        const networkDns = await search.send<NetworkDnsStrategyResponse>({
          supertest,
          options: {
            defaultIndex: ['packetbeat-*'],
            factoryQueryType: NetworkQueries.dns,
            filterQuery:
              '{"bool":{"must":[],"filter":[{"match_all":{}}],"should":[],"must_not":[]}}',
            isPtrIncluded: false,
            pagination: { activePage: 0, cursorStart: 0, fakePossibleCount: 30, querySize: 10 },
            sort: { field: NetworkDnsFields.uniqueDomains, direction: Direction.asc },
            timerange: {
              interval: '12h',
              to: TO,
              from: FROM,
            },
          },
          strategy: 'securitySolutionSearchStrategy',
        });

        expect(networkDns.edges.length).to.be(10);
        expect(networkDns.totalCount).to.be(44);
        expect(networkDns.edges.map((i: NetworkDnsEdges) => i.node.dnsName).join(',')).to.be(
          'aaplimg.com,adgrx.com,akadns.net,akamaiedge.net,amazonaws.com,cbsistatic.com,cdn-apple.com,connman.net,d1oxlq5h9kq8q5.cloudfront.net,d3epxf4t8a32oh.cloudfront.net'
        );
        expect(networkDns.pageInfo.fakeTotalCount).to.equal(30);
      });

      it('Make sure that we get Dns data and sorting by uniqueDomains descending', async () => {
        const networkDns = await search.send<NetworkDnsStrategyResponse>({
          supertest,
          options: {
            ip: '151.205.0.17',
            defaultIndex: ['packetbeat-*'],
            factoryQueryType: NetworkQueries.dns,
            inspect: false,
            pagination: {
              activePage: 0,
              cursorStart: 0,
              fakePossibleCount: 30,
              querySize: 10,
            },
            sort: { field: NetworkDnsFields.uniqueDomains, direction: Direction.desc },
            stackByField: 'dns.question.registered_domain',
            timerange: {
              interval: '12h',
              to: TO,
              from: FROM,
            },
          },
          strategy: 'securitySolutionSearchStrategy',
        });

        expect(networkDns.edges.length).to.be(10);
        expect(networkDns.totalCount).to.be(44);
        expect(networkDns.edges.map((i: NetworkDnsEdges) => i.node.dnsName).join(',')).to.be(
          'nflxvideo.net,apple.com,netflix.com,samsungcloudsolution.com,samsungqbe.com,samsungelectronics.com,internetat.tv,samsungcloudsolution.net,samsungosp.com,cbsnews.com'
        );
        expect(networkDns.pageInfo.fakeTotalCount).to.equal(30);
      });
    });
  });
}
