/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_REASON, ALERT_RULE_CONSUMER, ALERT_URL } from '@kbn/rule-data-utils';

import { sampleDocNoSortId, sampleRuleGuid } from '../__mocks__/es_results';
import {
  buildAlertGroupFromSequence,
  objectArrayIntersection,
  objectPairIntersection,
} from './build_alert_group_from_sequence';
import { SERVER_APP_ID } from '../../../../../common/constants';
import { getQueryRuleParams } from '../../rule_schema/mocks';
import {
  ALERT_ANCESTORS,
  ALERT_DEPTH,
  ALERT_BUILDING_BLOCK_TYPE,
  ALERT_GROUP_ID,
} from '../../../../../common/field_maps/field_names';
import { buildReasonMessageForEqlAlert } from '../utils/reason_formatters';
import { getSharedParamsMock } from '../__mocks__/shared_params';

const sharedParams = getSharedParamsMock({
  ruleParams: getQueryRuleParams(),
  rewrites: { spaceId: 'space' },
});

describe('buildAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('it builds an alert as expected without original_event if event does not exist', () => {
    const eqlSequence = {
      join_keys: [],
      events: [
        sampleDocNoSortId('d5e8eb51-a6a0-456d-8a15-4b79bfec3d71'),
        sampleDocNoSortId('619389b2-b077-400e-b40b-abde20d675d3'),
      ],
    };
    const { shellAlert, buildingBlocks } = buildAlertGroupFromSequence({
      sharedParams,
      sequence: eqlSequence,
      buildReasonMessage: buildReasonMessageForEqlAlert,
    });
    expect(buildingBlocks.length).toEqual(2);
    expect(buildingBlocks[0]).toEqual(
      expect.objectContaining({
        _source: expect.objectContaining({
          [ALERT_ANCESTORS]: [
            {
              depth: 0,
              id: 'd5e8eb51-a6a0-456d-8a15-4b79bfec3d71',
              index: 'myFakeSignalIndex',
              type: 'event',
            },
          ],
          [ALERT_DEPTH]: 1,
          [ALERT_RULE_CONSUMER]: SERVER_APP_ID,
          [ALERT_BUILDING_BLOCK_TYPE]: 'default',
        }),
      })
    );
    expect(buildingBlocks[0]?._source?.[ALERT_URL]).toContain(
      'http://testkibanabaseurl.com/s/space/app/security/alerts/redirect/f2db3574eaf8450e3f4d1cf4f416d70b110b035ae0a7a00026242df07f0a6c90?index=.alerts-security.alerts-space'
    );
    expect(buildingBlocks[1]).toEqual(
      expect.objectContaining({
        _source: expect.objectContaining({
          [ALERT_ANCESTORS]: [
            {
              depth: 0,
              id: '619389b2-b077-400e-b40b-abde20d675d3',
              index: 'myFakeSignalIndex',
              type: 'event',
            },
          ],
          [ALERT_DEPTH]: 1,
          [ALERT_RULE_CONSUMER]: SERVER_APP_ID,
          [ALERT_BUILDING_BLOCK_TYPE]: 'default',
        }),
      })
    );
    expect(buildingBlocks[1]._source[ALERT_URL]).toContain(
      'http://testkibanabaseurl.com/s/space/app/security/alerts/redirect/1dbc416333244efbda833832eb83f13ea5d980a33c2f981ca8d2b35d82a045da?index=.alerts-security.alerts-space'
    );
    expect(shellAlert).toEqual(
      expect.objectContaining({
        _source: expect.objectContaining({
          [ALERT_ANCESTORS]: expect.arrayContaining([
            {
              depth: 0,
              id: 'd5e8eb51-a6a0-456d-8a15-4b79bfec3d71',
              index: 'myFakeSignalIndex',
              type: 'event',
            },
            {
              depth: 0,
              id: '619389b2-b077-400e-b40b-abde20d675d3',
              index: 'myFakeSignalIndex',
              type: 'event',
            },
            {
              depth: 1,
              id: buildingBlocks[0]?._id,
              index: '',
              rule: sampleRuleGuid,
              type: 'signal',
            },
            {
              depth: 1,
              id: buildingBlocks[0]._id,
              index: '',
              rule: sampleRuleGuid,
              type: 'signal',
            },
          ]),
          [ALERT_DEPTH]: 2,
          [ALERT_BUILDING_BLOCK_TYPE]: 'default',
          [ALERT_RULE_CONSUMER]: SERVER_APP_ID,
          [ALERT_REASON]: 'event with source 127.0.0.1 created high alert rule-name.',
        }),
      })
    );
    expect(shellAlert?._source[ALERT_URL]).toContain(
      'http://testkibanabaseurl.com/s/space/app/security/alerts/redirect/1b7d06954e74257140f3bf73f139078483f9658fe829fd806cc307fc0388fb23?index=.alerts-security.alerts-space'
    );
    const groupIds = buildingBlocks.map((alert) => alert?._source?.[ALERT_GROUP_ID]);
    for (const groupId of groupIds) {
      expect(groupId).toEqual(groupIds[0]);
    }
  });

  describe('recursive intersection between objects', () => {
    describe('objectPairIntersection', () => {
      test('returns the intersection of fields with identically-valued arrays', () => {
        const a = {
          field1: [1],
        };
        const b = {
          field1: [1],
        };
        const intersection = objectPairIntersection(a, b);
        const expected = {
          field1: [1],
        };
        expect(intersection).toEqual(expected);
      });

      test('returns the intersection of arrays with differing lengths', () => {
        const a = {
          field1: 1,
        };
        const b = {
          field1: [1, 2, 3],
        };
        const intersection = objectPairIntersection(a, b);
        const expected = {
          field1: [1],
        };
        expect(intersection).toEqual(expected);
      });

      test('should work with arrays with same lengths but only one intersecting element', () => {
        const a = {
          field1: [3, 4, 5],
        };
        const b = {
          field1: [1, 2, 3],
        };
        const intersection = objectPairIntersection(a, b);
        const expected = {
          field1: [3],
        };
        expect(intersection).toEqual(expected);
      });

      test('should work with arrays with differing lengths and two intersecting elements', () => {
        const a = {
          field1: [3, 4, 5],
        };
        const b = {
          field1: [1, 2, 3, 4],
        };
        const intersection = objectPairIntersection(a, b);
        const expected = {
          field1: [3, 4],
        };
        expect(intersection).toEqual(expected);
      });
    });

    test('should treat numbers and strings as unequal', () => {
      const a = {
        field1: 1,
        field2: 1,
      };
      const b = {
        field1: 1,
        field2: '1',
      };
      const intersection = objectPairIntersection(a, b);
      const expected = {
        field1: 1,
      };
      expect(intersection).toEqual(expected);
    });

    test('should strip unequal numbers and strings', () => {
      const a = {
        field1: 1,
        field2: 1,
        field3: 'abcd',
        field4: 'abcd',
      };
      const b = {
        field1: 1,
        field2: 100,
        field3: 'abcd',
        field4: 'wxyz',
      };
      const intersection = objectPairIntersection(a, b);
      const expected = {
        field1: 1,
        field3: 'abcd',
      };
      expect(intersection).toEqual(expected);
    });

    test('should handle null values', () => {
      const a = {
        field1: 1,
        field2: '1',
        field3: null,
      };
      const b = {
        field1: null,
        field2: null,
        field3: null,
      };
      const intersection = objectPairIntersection(a, b);
      const expected = {
        field3: null,
      };
      expect(intersection).toEqual(expected);
    });

    test('should handle explicit undefined values and return undefined if left with only undefined fields', () => {
      const a = {
        field1: 1,
        field2: '1',
        field3: undefined,
      };
      const b = {
        field1: undefined,
        field2: undefined,
        field3: undefined,
      };
      const intersection = objectPairIntersection(a, b);
      const expected = undefined;
      expect(intersection).toEqual(expected);
    });

    test('returns the intersection of values for fields containing arrays', () => {
      const a = {
        array_field1: [1, 2],
        array_field2: [1, 2],
      };
      const b = {
        array_field1: [1, 2],
        array_field2: [3, 4],
      };
      const intersection = objectPairIntersection(a, b);
      const expected = { array_field1: [1, 2], array_field2: [] };
      expect(intersection).toEqual(expected);
    });

    test('should strip fields that are not in both objects', () => {
      const a = {
        field1: 1,
      };
      const b = {
        field2: 1,
      };
      const intersection = objectPairIntersection(a, b);
      const expected = undefined;
      expect(intersection).toEqual(expected);
    });

    test('should work on objects within objects', () => {
      const a = {
        container_field: {
          field1: 1,
          field2: 1,
          field3: 10,
          field5: 1,
          field6: null,
          array_field: [1, 2],
          nested_container_field: {
            field1: 1,
            field2: 1,
          },
          nested_container_field2: {
            field1: undefined,
          },
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      const b = {
        container_field: {
          field1: 1,
          field2: 2,
          field4: 10,
          field5: '1',
          field6: null,
          array_field: [1, 2],
          nested_container_field: {
            field1: 1,
            field2: 2,
          },
          nested_container_field2: {
            field1: undefined,
          },
        },
        container_field_without_intersection: {
          sub_field2: 1,
        },
      };
      const intersection = objectPairIntersection(a, b);
      const expected = {
        container_field: {
          array_field: [1, 2],
          field1: 1,
          field6: null,
          nested_container_field: {
            field1: 1,
          },
        },
      };
      expect(intersection).toEqual(expected);
    });

    test('should work on objects with a variety of fields', () => {
      const a = {
        field1: 1,
        field2: 1,
        field3: 10,
        field5: 1,
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 1,
          sub_field3: 10,
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      const b = {
        field1: 1,
        field2: 2,
        field4: 10,
        field5: '1',
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 2,
          sub_field4: 10,
        },
        container_field_without_intersection: {
          sub_field2: 1,
        },
      };
      const intersection = objectPairIntersection(a, b);
      const expected = {
        array_field: [1, 2],
        field1: 1,
        field6: null,
        container_field: {
          sub_field1: 1,
        },
      };
      expect(intersection).toEqual(expected);
    });
  });

  describe('objectArrayIntersection', () => {
    test('should return undefined if the array is empty', () => {
      const intersection = objectArrayIntersection([]);
      const expected = undefined;
      expect(intersection).toEqual(expected);
    });
    test('should return the initial object if there is only 1', () => {
      const a = {
        field1: 1,
        field2: 1,
        field3: 10,
        field5: 1,
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 1,
          sub_field3: 10,
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      const intersection = objectArrayIntersection([a]);
      const expected = {
        field1: 1,
        field2: 1,
        field3: 10,
        field5: 1,
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 1,
          sub_field3: 10,
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      expect(intersection).toEqual(expected);
    });
    test('should work with exactly 2 objects', () => {
      const a = {
        field1: 1,
        field2: 1,
        field3: 10,
        field5: 1,
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 1,
          sub_field3: 10,
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      const b = {
        field1: 1,
        field2: 2,
        field4: 10,
        field5: '1',
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 2,
          sub_field4: 10,
        },
        container_field_without_intersection: {
          sub_field2: 1,
        },
      };
      const intersection = objectArrayIntersection([a, b]);
      const expected = {
        array_field: [1, 2],
        field1: 1,
        field6: null,
        container_field: {
          sub_field1: 1,
        },
      };
      expect(intersection).toEqual(expected);
    });
    test('should work with 3 or more objects', () => {
      const a = {
        field1: 1,
        field2: 1,
        field3: 10,
        field5: 1,
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 1,
          sub_field3: 10,
        },
        container_field_without_intersection: {
          sub_field1: 1,
        },
      };
      const b = {
        field1: 1,
        field2: 2,
        field4: 10,
        field5: '1',
        field6: null,
        array_field: [1, 2],
        container_field: {
          sub_field1: 1,
          sub_field2: 2,
          sub_field4: 10,
        },
        container_field_without_intersection: {
          sub_field2: 1,
        },
      };
      const c = {
        field1: 1,
        field2: 2,
        field4: 10,
        field5: '1',
        array_field: [1, 2],
        container_field: {
          sub_field2: 2,
          sub_field4: 10,
        },
        container_field_without_intersection: {
          sub_field2: 1,
        },
      };
      const intersection = objectArrayIntersection([a, b, c]);
      const expected = {
        array_field: [1, 2],
        field1: 1,
      };
      expect(intersection).toEqual(expected);
    });
  });
});
