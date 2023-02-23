/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { apm, ApmFields, Instance } from '@kbn/apm-synthtrace-client';
import { Scenario } from '../cli/scenario';
import { getSynthtraceEnvironment } from '../lib/utils/get_synthtrace_environment';

const ENVIRONMENT = getSynthtraceEnvironment(__filename);

const scenario: Scenario<ApmFields> = async ({ logger, scenarioOpts }) => {
  const { numServices = 3 } = scenarioOpts || {};

  return {
    generate: ({ range }) => {
      const transactionName = 'ldap-test';

      const successfulTimestamps = range.ratePerMinute(10);

      const instances = [...Array(numServices).keys()].map((index) =>
        apm
          .service({ name: `ldap-test-${index}`, environment: ENVIRONMENT, agentName: 'java' })
          .instance('instance')
      );
      const instanceSpans = (instance: Instance) => {
        const successfulTraceEvents = successfulTimestamps.generator((timestamp) =>
          instance
            .transaction({ transactionName })
            .timestamp(timestamp)
            .duration(1000)
            .success()
            .children(
              instance
                .span({
                  spanName: 'GET apm-*/_search',
                  spanType: 'db',
                  spanSubtype: 'elasticsearch',
                })
                .duration(1000)
                .success()
                .destination('elasticsearch')
                .timestamp(timestamp),
              instance
                .span({ spanName: 'ldap operation', spanType: 'external', spanSubtype: 'ldap' })
                .duration(100)
                .success()
                .destination('ldap/instance1')
                .timestamp(timestamp)
            )
        );

        return successfulTraceEvents;
      };

      return instances.map((instance) =>
        logger.perf('generating_apm_events', () => instanceSpans(instance))
      );
    },
  };
};

export default scenario;
