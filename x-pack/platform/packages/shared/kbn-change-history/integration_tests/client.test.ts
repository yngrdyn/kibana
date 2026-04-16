/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { ToolingLog } from '@kbn/tooling-log';
import type { EsTestCluster } from '@kbn/test';
import { createTestEsCluster } from '@kbn/test';
import { FLAGS } from '../src/constants';
import { ChangeHistoryClient } from '..';
import { DATA_STREAM_NAME, SEQUENCE_COUNTER_INDEX } from '../src/client';
import type { ChangeHistoryDocument, ObjectChange } from '..';
import { sha256 } from '../src/utils';

type ElasticsearchBulkParams = Parameters<Client['bulk']>[0];
type ElasticsearchBulkOptions = Parameters<Client['bulk']>[1];
type ElasticsearchUpdateParams = Parameters<Client['update']>[0];

const KIBANA_SPACE = 'default';
const TEST_MODULE = 'test-module';
const TEST_DATASET = 'test-dataset';

const defaultLogOpts = {
  action: 'rule_create',
  username: 'test-user',
  userProfileId: 'test-user-profile-id',
  spaceId: 'default',
  refresh: true as const,
};

describe('ChangeHistoryClient', () => {
  let esServer: EsTestCluster;
  const logger = loggingSystemMock.createLogger();

  const defaultCostructorOpts = {
    module: TEST_MODULE,
    dataset: TEST_DATASET,
    logger,
    kibanaVersion: '1.0.0',
  };

  const cleanup = async () => {
    const client = esServer.getClient();
    await client.indices.deleteDataStream({ name: DATA_STREAM_NAME }).catch(() => {});
    await client.indices.deleteIndexTemplate({ name: DATA_STREAM_NAME }).catch(() => {});
    await client.indices.delete({ index: SEQUENCE_COUNTER_INDEX }).catch(() => {});
  };

  beforeAll(async () => {
    FLAGS.FEATURE_ENABLED = true;
    jest.setTimeout(30_000);
    esServer = createTestEsCluster({
      log: new ToolingLog({ writeTo: process.stdout, level: 'debug' }),
    });
    await esServer.start();
  });

  afterAll(async () => {
    await esServer.stop();
    FLAGS.FEATURE_ENABLED = false;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('initialize', () => {
    const getEsDataStreams = async (name: string) => {
      try {
        const res = await esServer.getClient().indices.getDataStream({ name });
        return res?.data_streams?.map((s) => s.name) ?? [];
      } catch (error) {
        if (
          error.meta?.statusCode === 404 &&
          error.body?.error?.type === 'index_not_found_exception'
        ) {
          return [];
        }
        throw error;
      }
    };

    it('should initialize the data stream', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      expect(client.isInitialized()).toBe(false);

      expect(await getEsDataStreams(DATA_STREAM_NAME)).toHaveLength(0);

      await client.initialize(esServer.getClient());
      expect(client.isInitialized()).toBe(true);

      expect(await getEsDataStreams(DATA_STREAM_NAME)).toEqual([DATA_STREAM_NAME]);

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'any-id');
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('error behavior', () => {
    it('should throw when creating with invalid module or dataset', async () => {
      await expect(
        () => new ChangeHistoryClient({ ...defaultCostructorOpts, module: 'invalid|module' })
      ).toThrow('Invalid module');
      await expect(
        () => new ChangeHistoryClient({ ...defaultCostructorOpts, dataset: 'invalid|dataset' })
      ).toThrow('Invalid dataset');
    });

    it('should throw when log is called before initialize', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'id-1',
        after: { name: 'Rule 1' },
      };
      await expect(() =>
        client.log(change, { ...defaultLogOpts, spaceId: 'default' })
      ).rejects.toThrow('Change history data stream not initialized');
    });

    it('should throw when getHistory is called before initialize', async () => {
      const client = new ChangeHistoryClient(defaultCostructorOpts);
      await expect(() => client.getHistory(KIBANA_SPACE, 'rule', 'id-1')).rejects.toThrow(
        'Change history data stream not initialized'
      );
    });
  });

  describe('log and getHistory', () => {
    let client: ChangeHistoryClient;
    let esClient: Client;

    beforeEach(async () => {
      esClient = esServer.getClient();
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esClient);
    });

    it('should log one change and return it via getHistory', async () => {
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'id-1',
        after: { name: 'Rule 1', enabled: true },
      };
      const hash = sha256(JSON.stringify(change.after));
      await client.log(change, { ...defaultLogOpts, spaceId: 'default' });

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'id-1');
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      const doc = result.items[0] as ChangeHistoryDocument;
      expect(doc).toMatchObject({
        '@timestamp': expect.any(String),
        ecs: { version: '9.3.0' },
        user: { name: 'test-user', id: 'test-user-profile-id' },
        event: {
          id: expect.any(String),
          created: expect.any(String),
          module: TEST_MODULE,
          dataset: TEST_DATASET,
          action: 'rule_create',
          type: 'change',
        },
        object: {
          type: 'rule',
          id: 'id-1',
          hash,
          sequence: 1,
          fields: { hashed: [] },
          snapshot: { name: 'Rule 1', enabled: true },
        },
        service: {
          type: 'kibana',
          version: expect.any(String),
        },
      });
    });
  });

  describe('logBulk and getHistory', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esServer.getClient());
    });

    it('should log multiple changes and return them via getHistory with correct count and ordering', async () => {
      const timestamp = new Date(Date.now() - 1).toISOString();
      const changes: ObjectChange[] = [
        { objectType: 'rule', objectId: 'id-a', after: { name: 'Rule A update 1' } },
        { objectType: 'rule', objectId: 'id-c', after: { name: 'Rule C update 3' } },
        { objectType: 'rule', objectId: 'id-b', after: { name: 'Rule B update 3' } },
        { objectType: 'rule', objectId: 'id-a', after: { name: 'Rule A update 2' } },
      ];
      await client.logBulk(changes, { ...defaultLogOpts, spaceId: 'default' });
      const changes2: ObjectChange[] = [
        { objectType: 'rule', objectId: 'id-a', after: { name: 'Rule A update 3' } },
        { objectType: 'rule', objectId: 'id-c', after: { name: 'Rule C update 1' }, timestamp }, // <-- older timestamp, happened first
        { objectType: 'rule', objectId: 'id-b', after: { name: 'Rule B update 1' } },
        { objectType: 'rule', objectId: 'id-b', after: { name: 'Rule B update 2' } },
        { objectType: 'rule', objectId: 'id-c', after: { name: 'Rule C update 2' }, timestamp }, // <-- older timestamp, happened first
        { objectType: 'rule', objectId: 'id-c', after: { name: 'Rule C update 4' } },
      ];
      await client.logBulk(changes2, { ...defaultLogOpts, spaceId: 'default' });

      // Check Rule A
      const resultA = await client.getHistory(KIBANA_SPACE, 'rule', 'id-a');
      expect(resultA.total).toBe(3);
      const snapshotsA = resultA.items.map((i) => i.object.snapshot);
      expect(snapshotsA).toEqual([
        { name: 'Rule A update 3' },
        { name: 'Rule A update 2' },
        { name: 'Rule A update 1' },
      ]);

      // Check Rule B
      const resultB = await client.getHistory(KIBANA_SPACE, 'rule', 'id-b');
      expect(resultB.total).toBe(3);
      const snapshotsB = resultB.items.map((i) => i.object.snapshot);
      expect(snapshotsB).toEqual([
        { name: 'Rule B update 2' },
        { name: 'Rule B update 1' },
        { name: 'Rule B update 3' },
      ]);

      // Check Rule C — ordering follows auto-incremented `object.sequence` (desc), not ingest timestamps alone
      const resultC = await client.getHistory(KIBANA_SPACE, 'rule', 'id-c');
      expect(resultC.total).toBe(4);
      const snapshotsC = resultC.items.map((i) => i.object.snapshot);
      expect(snapshotsC).toEqual([
        { name: 'Rule C update 4' },
        { name: 'Rule C update 2' },
        { name: 'Rule C update 1' },
        { name: 'Rule C update 3' },
      ]);
      expect(resultC.items.map((i) => i.object.sequence)).toEqual([4, 3, 2, 1]);

      // Check decreasing Event Ids
      // (reverse order in the output)
      const eventIds = resultA.items.map((i) => i.event.id);
      expect(eventIds).toEqual(eventIds.slice().sort().reverse());

      // Check decreasing sequence
      const sequence = resultB.items.map((i) => i.object.sequence);
      expect(sequence).toEqual(sequence.slice().sort().reverse());
    });

    it('should assign autogenerated object.sequence across sequential log calls for one object', async () => {
      for (let v = 1; v <= 4; v++) {
        await client.log(
          { objectType: 'rule', objectId: 'mono-id', after: { version: v } },
          { ...defaultLogOpts, spaceId: 'default' }
        );
      }
      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'mono-id');
      expect(result.total).toBe(4);
      expect(result.items.map((i) => i.object.sequence)).toEqual([4, 3, 2, 1]);
      expect(result.items.map((i) => i.object.snapshot)).toEqual([
        { version: 4 },
        { version: 3 },
        { version: 2 },
        { version: 1 },
      ]);
    });

    it('should assign sequences 1 then 2 when two ES clients log the same new object concurrently (first counter race)', async () => {
      const objectId = `first-write-race-${Date.now()}`;
      const esA = esServer.getClient();
      const esB = esServer.getClient();
      const clientA = new ChangeHistoryClient(defaultCostructorOpts);
      const clientB = new ChangeHistoryClient(defaultCostructorOpts);

      await Promise.all([clientA.initialize(esA), clientB.initialize(esB)]);

      await Promise.all([
        clientA.log(
          { objectType: 'rule', objectId, after: { writer: 'instance-a' } },
          { ...defaultLogOpts, spaceId: 'default' }
        ),
        clientB.log(
          { objectType: 'rule', objectId, after: { writer: 'instance-b' } },
          { ...defaultLogOpts, spaceId: 'default' }
        ),
      ]);

      const result = await clientA.getHistory(KIBANA_SPACE, 'rule', objectId);
      expect(result.total).toBe(2);
      expect([...result.items.map((item) => item.object.sequence)].sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
      // Default history sort is sequence descending: second allocated number appears first.
      expect(result.items.map((item) => item.object.sequence)).toEqual([2, 1]);

      const writers = result.items.map(
        (item) => (item.object.snapshot as { writer: string }).writer
      );
      expect(writers.sort()).toEqual(['instance-a', 'instance-b']);
    });

    it('should not throw on partial success when some bulk items fail', async () => {
      const objectType = 'rule';
      const objectId = 'partial-id';
      const rawClient = esServer.getClient();
      let injectedInvalidDoc = false;
      const partiallyFailingClient = new Proxy(rawClient, {
        get(target, prop, receiver) {
          if (prop === 'bulk') {
            return async (params: ElasticsearchBulkParams, options?: ElasticsearchBulkOptions) => {
              if (
                !injectedInvalidDoc &&
                params.index === DATA_STREAM_NAME &&
                Array.isArray(params.operations)
              ) {
                // bulk format: [createMeta, doc, createMeta, doc, ...]
                // Corrupt only the second doc timestamp so one item fails at ES date parsing.
                const operations = [...params.operations];
                const secondDoc = operations[3] as Record<string, unknown>;
                operations[3] = { ...secondDoc, '@timestamp': 'not-a-date' };
                injectedInvalidDoc = true;
                return target.bulk({ ...params, operations }, options);
              }

              return target.bulk(params, options);
            };
          }

          return Reflect.get(target, prop, receiver);
        },
      }) as unknown as Client;
      const partialClient = new ChangeHistoryClient(defaultCostructorOpts);
      await partialClient.initialize(partiallyFailingClient);

      const changes: ObjectChange[] = [
        { objectType, objectId, after: { name: 'First Rule' } },
        { objectType, objectId, after: { name: 'Middle Rule' } },
        { objectType, objectId, after: { name: 'Last Rule' } },
      ];

      await expect(
        partialClient.logBulk(changes, { ...defaultLogOpts, spaceId: 'default' })
      ).resolves.not.toThrow();

      const result = await partialClient.getHistory(KIBANA_SPACE, objectType, objectId);
      expect(result.total).toBe(2);
      expect(result.items.map((i) => i.object.snapshot)).toEqual([
        { name: 'Last Rule' },
        { name: 'First Rule' },
      ]);
      // Sequence allocation happens before indexing, so failed items can leave a gap.
      expect(result.items.map((i) => i.object.sequence)).toEqual([3, 1]);
      expect(injectedInvalidDoc).toBe(true);
    });
  });

  // TODO: Add test for checking kibana space behavior in @kbn-change-history (underneath the hood)

  describe('before/after diff', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esServer.getClient());
    });

    it('should populate object.diff when "before" is provided', async () => {
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'diff-id',
        before: { name: 'Old name', enabled: true, status: 'draft' },
        after: { name: 'New name', enabled: true, status: 'published' },
      };
      await client.log(change, {
        ...defaultLogOpts,
        spaceId: 'default',
        fieldsToIgnore: { status: true },
      });

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'diff-id');
      expect(result.total).toBe(1);
      const doc = result.items[0] as ChangeHistoryDocument;
      expect(doc.object.diff).toEqual({
        type: 'default',
        fields: ['name'],
        before: { name: 'Old name' },
      });
      expect(doc.object.snapshot).toEqual(change.after);
    });
  });

  describe('hashing selected fields', () => {
    let client: ChangeHistoryClient;

    beforeEach(async () => {
      client = new ChangeHistoryClient(defaultCostructorOpts);
      await client.initialize(esServer.getClient());
    });

    it('should hash sensitive fields in snapshot and list paths in object.fields.hashed', async () => {
      const change: ObjectChange = {
        objectType: 'rule',
        objectId: 'masked-id',
        after: {
          name: 'My Rule',
          user: { email: 'secret@example.com', name: 'Alice' },
          apiKey: 'sk-secret-key-12345',
        },
      };
      const fieldsToHash = {
        user: { email: true },
        apiKey: true,
      };
      await client.log(change, {
        ...defaultLogOpts,
        spaceId: 'default',
        fieldsToHash,
      });

      const result = await client.getHistory(KIBANA_SPACE, 'rule', 'masked-id');
      expect(result.total).toBe(1);
      const doc = result.items[0] as ChangeHistoryDocument;

      // Check hash
      const hash = sha256(JSON.stringify(change.after));
      expect(doc.object.hash).toEqual(hash);

      // Check hashed field paths
      expect(doc.object.fields.hashed.sort()).toEqual(['apiKey', 'user.email'].sort());
      const snapshot = doc.object.snapshot as Record<string, unknown>;
      expect(snapshot).toEqual({
        name: 'My Rule',
        user: {
          email: sha256('secret@example.com'),
          name: 'Alice',
        },
        apiKey: sha256('sk-secret-key-12345'),
      });
    });
  });
});
