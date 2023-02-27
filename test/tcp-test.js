import assert from 'node:assert';
import { Buffer } from 'node:buffer';

import { createClient } from 'redis';
import memcached from 'memcached';
import DivvyClient from '@button/divvy-client';
import mysql from 'mysql';
import pg from 'pg';

import { tcp } from '../src/index.js';
import { req, asyncSocket, hexBuffer, saslSignature } from './helpers/index.js';
import { mockSchema } from '../src/tcp/schema.js';
import { wait } from '../src/lib.js';

describe('tcp', function () {
  before(async function () {
    this.dep = await tcp();
  });

  afterEach(function () {
    this.dep.reset();
  });

  after(async function () {
    await this.dep.teardown();
  });

  describe('schema', function () {
    it('expects valid tcp arguments', async function () {
      let message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options` if defined must be plain object (got /bloop/)';

      assert.throws(() => tcp(/bloop/), {
        name: 'ValidationError',
        message,
      });

      message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options.port` if defined must be positive integer (got -2)';

      assert.throws(() => tcp({ port: -2 }), {
        name: 'ValidationError',
        message,
      });

      let server;
      try {
        server = await tcp({});
      } finally {
        server && (await server.teardown());
      }
    });

    it('expects a valid mock', function () {
      assert.deepStrictEqual(mockSchema(/bloop/, ['options']), [
        /bloop/,
        ['`options` if defined must be plain object (got /bloop/)'],
      ]);

      assert.deepStrictEqual(mockSchema(undefined, ['options']), [
        undefined,
        [],
      ]);

      assert.deepStrictEqual(
        mockSchema({ init: 'bloop', req: 'oof', res: 'youch' }, ['options']),
        [
          { init: 'bloop', req: 'oof', res: 'youch' },
          [
            "`options` init cannot be defined at the same time as req or res (got { init: 'bloop', req: 'oof', res: 'youch' })",
          ],
        ]
      );

      assert.deepStrictEqual(mockSchema({}, ['options']), [{}, []]);
    });

    it('expects a valid init value', function () {
      assert.deepStrictEqual(mockSchema({ init: /bloop/ })[1], [
        '`init` if defined must be string or buffer (got /bloop/)',
      ]);

      assert.deepStrictEqual(mockSchema({ init: undefined })[1], []);
      assert.deepStrictEqual(mockSchema({ init: 'string' })[1], []);
      assert.deepStrictEqual(
        mockSchema({ init: Buffer.from('buffer', 'utf8') })[1],
        []
      );
    });

    it('expects a valid req value', function () {
      assert.deepStrictEqual(mockSchema({ req: false })[1], [
        '`req` if defined must be string, buffer, regular expression, or function (got false)',
      ]);

      assert.deepStrictEqual(mockSchema({ req: undefined })[1], []);
      assert.deepStrictEqual(mockSchema({ req: 'string' })[1], []);
      assert.deepStrictEqual(
        mockSchema({ req: Buffer.from('buffer', 'utf8') })[1],
        []
      );
      assert.deepStrictEqual(mockSchema({ req: /string/ })[1], []);

      const [m, errors] = mockSchema({
        req: (v) => (v === 'boolean' ? true : /bloop/),
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(m.req('boolean'), true);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `req()` must be boolean (got /bloop/)';

      assert.throws(() => m.req('oops'), { name: 'ValidationError', message });
    });

    it('expects a valid res value', function () {
      assert.deepStrictEqual(mockSchema({ res: /bloop/ })[1], [
        '`res` if defined must be object, string, or buffer or function returning same (got /bloop/)',
      ]);

      assert.deepStrictEqual(mockSchema({ res: undefined })[1], []);
      assert.deepStrictEqual(mockSchema({ res: 'string' })[1], []);
      assert.deepStrictEqual(
        mockSchema({ res: Buffer.from('buffer', 'utf8') })[1],
        []
      );

      assert.deepStrictEqual(
        mockSchema({
          res: { body: /bloop/, bodyDelay: -2, destroySocket: /oof/ },
        })[1],
        [
          '`res.body` if defined must be string, buffer, or function returning same (got /bloop/)',
          '`res.bodyDelay` if defined must be positive integer or function returning same (got -2)',
          '`res.destroySocket` if defined must be boolean or function returning same (got /oof/)',
        ]
      );

      assert.deepStrictEqual(
        mockSchema({
          res: { body: undefined, bodyDelay: 20, destroySocket: true },
        })[1],
        []
      );
      assert.deepStrictEqual(mockSchema({ res: { body: 'string' } })[1], []);
      assert.deepStrictEqual(
        mockSchema({ res: { body: Buffer.from('buffer', 'utf8') } })[1],
        []
      );

      const [m, errors] = mockSchema({
        res: (v) => {
          if (v === 'string') {
            return 'string';
          }

          if (v === 'buffer') {
            return Buffer.from('buffer', 'utf8');
          }

          if (v === 'undefined') {
            return undefined;
          }

          if (v === 'obj') {
            return {
              bodyDelay: (v2) => {
                if (v2 === 'number') {
                  return 42;
                }

                return /oof/;
              },
            };
          }

          return /bloop/;
        },
      });

      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(m.res('string'), 'string');
      assert.deepStrictEqual(m.res('buffer'), Buffer.from('buffer', 'utf8'));
      assert.deepStrictEqual(m.res('undefined'), undefined);
      assert.deepStrictEqual(m.res('obj').bodyDelay('number'), 42);

      let message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `res()` if defined must be object, string, or buffer (got /bloop/)';

      assert.throws(() => m.res('oops'), { name: 'ValidationError', message });

      message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `res().bodyDelay()` if defined must be positive integer (got /oof/)';

      assert.throws(() => m.res('obj').bodyDelay('oof'), {
        name: 'ValidationError',
        message,
      });
    });
  });

  describe('basics', function () {
    it('validates mock options', function () {
      const message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options.req` if defined must be string, buffer, regular expression, or function (got 1989)\n' +
        '  * `options.res.body` if defined must be string, buffer, or function returning same (got /yikes/)\n' +
        '  * `options.res.bodyDelay` if defined must be positive integer or function returning same (got -1)';

      assert.throws(
        () =>
          this.dep.mock({ req: 1989, res: { bodyDelay: -1, body: /yikes/ } }),
        {
          name: 'ValidationError',
          message,
        }
      );
    });

    it('mocks a tcp request', async function () {
      this.dep.mock({ req: 'abcd', res: '1234' });

      const client = await asyncSocket({ port: this.dep.port });

      client.write('abcd');
      const res = await client.read();

      assert.deepStrictEqual(res.toString('utf8'), '1234');

      client.end();
    });

    it('does very little with no arguments', async function () {
      this.dep.mock();

      const client = await asyncSocket({ port: this.dep.port });

      client.write('abcd');

      await assert.rejects(() => client.read(), {
        name: 'Error',
        message: 'Read timeout',
      });
    });

    it('matches across many writes', async function () {
      const receiveQueue = [];

      this.dep.mock({
        req: (b) => {
          receiveQueue.push(b);
          return b.toString('utf8') === 'abcd';
        },
        res: '1234',
      });

      const client = await asyncSocket({ port: this.dep.port });

      await client.write('ab');

      // Ensure enough time passes for writes to arrive.
      await wait(10);

      await client.write('cd');

      const res = await client.read();

      assert.deepStrictEqual(res.toString('utf8'), '1234');

      assert.deepStrictEqual(receiveQueue, [
        Buffer.from('ab', 'utf8'),
        Buffer.from('abcd', 'utf8'),
      ]);

      client.end();
    });

    it('consumes mocks in order', async function () {
      const first = this.dep.mock({
        req: 'abcd',
        res: '12',
      });

      const second = this.dep.mock({
        req: 'abcd',
        res: '34',
      });

      const client = await asyncSocket({ port: this.dep.port });

      await client.write('abcd');
      const firstRes = await client.read();
      assert.deepStrictEqual(firstRes.toString('utf8'), '12');
      first.assertDone();
      assert.throws(() => second.assertDone(), {
        name: 'PendingMockError',
        message: "Mock is still pending: TCP{req='abcd' res='34'}",
      });

      await client.write('abcd');
      const secondRes = await client.read();
      assert.deepStrictEqual(secondRes.toString('utf8'), '34');
      second.assertDone();

      client.end();
    });

    it('allows mocks to be consumed from different connections', async function () {
      this.dep.mock({ req: 'abcd', res: '12' });
      this.dep.mock({ req: 'abcd', res: '34' });

      const clientA = await asyncSocket({ port: this.dep.port });
      const clientB = await asyncSocket({ port: this.dep.port });

      await clientA.write('abcd');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), '12');

      await clientB.write('abcd');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), '34');
    });

    it('scopes writes to a given connection', async function () {
      this.dep.mock({ req: (b) => b.length === 4, res: (r) => r });
      this.dep.mock({ req: (b) => b.length === 4, res: (r) => r });

      const clientA = await asyncSocket({ port: this.dep.port });
      const clientB = await asyncSocket({ port: this.dep.port });

      await clientA.write('aa');
      await clientB.write('bb');

      await assert.rejects(() => clientA.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await assert.rejects(() => clientB.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await clientB.write('BB');

      await assert.rejects(() => clientA.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'bbBB');

      await clientA.write('AA');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'aaAA');
    });

    it('allows mocks to be pinned to the same connections', async function () {
      this.dep.mock({ res: 'a' }).mock({ res: 'b' }).mock({ res: 'c' });
      this.dep.mock({ res: 'd' }).mock({ res: 'e' }).mock({ res: 'f' });

      const clientA = await asyncSocket({ port: this.dep.port });
      const clientB = await asyncSocket({ port: this.dep.port });
      const clientC = await asyncSocket({ port: this.dep.port });

      await clientA.write('a');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'a');

      await clientB.write('d');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'd');

      await clientC.write('b');
      await assert.rejects(() => clientC.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await clientB.write('e');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'e');

      await clientA.write('b');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'b');

      await clientB.write('f');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'f');

      await assert.rejects(() => clientB.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await clientA.write('c');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'c');
    });

    it('allows mocks to be pinned to the same connections (with inits)', async function () {
      this.dep
        .mock({ init: 'a' })
        .mock({ req: 'b', res: 'b' })
        .mock({ req: 'c', res: 'c' });

      this.dep
        .mock({ init: 'd' })
        .mock({ req: 'e', res: 'e' })
        .mock({ req: 'f', res: 'f' });

      const clientA = await asyncSocket({ port: this.dep.port });
      const clientB = await asyncSocket({ port: this.dep.port });
      const clientC = await asyncSocket({ port: this.dep.port });

      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'a');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'd');
      await assert.rejects(() => clientC.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await clientB.write('e');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'e');

      await clientA.write('b');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'b');

      await clientB.write('f');
      assert.deepStrictEqual((await clientB.read()).toString('utf8'), 'f');

      await assert.rejects(() => clientB.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await clientA.write('c');
      assert.deepStrictEqual((await clientA.read()).toString('utf8'), 'c');
    });

    it(`matches pinned mocks in the order they're received`, async function () {
      const head = this.dep.mock({ res: 'a' });
      const second = head.mock({ res: 'b' });
      second.mock({ res: 'c' });
      head.mock({ res: 'd' });

      const client = await asyncSocket({ port: this.dep.port });

      await client.write('a');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'a');

      await client.write('a');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'b');

      await client.write('a');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'c');

      await client.write('a');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'd');
    });

    it(`won't match pinned mocks whose head hasn't been matched`, async function () {
      this.dep.mock({ req: 'bloop', res: 'a' }).mock({ res: 'b' });

      const client = await asyncSocket({ port: this.dep.port });

      await client.write('b');
      await assert.rejects(() => client.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      await client.write('loop');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'a');

      await client.write('a');
      assert.deepStrictEqual((await client.read()).toString('utf8'), 'b');
    });

    it(`disallows init on a pinned mock`, async function () {
      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `options` init not supported on a connection-pinned mock (got { _pinnedTo: { connection: null }, init: 'b' })";

      assert.throws(() => this.dep.mock({}).mock({ init: 'b' }), {
        name: 'ValidationError',
        message,
      });

      this.dep.reset({ throwOnPending: false });
    });

    it('reset() fails with many unmatched mocks', async function () {
      this.dep.mock({ req: 'abcd', res: '12' });
      this.dep.mock({ req: 'bloop', res: '13' });
      this.dep.mock({ init: 'oof' });

      assert.throws(() => this.dep.reset(), {
        name: 'PendingMockError',
        message:
          "The following mocks are still pending: TCP{req='abcd' res='12'}, TCP{req='bloop' res='13'}, TCP{init='oof'}",
      });
    });

    it('reset({ throwOnPending: false }) succeeds with many unmatched mocks', async function () {
      this.dep.mock({ req: 'abcd', res: '12' });
      this.dep.mock({ req: 'bloop', res: '13' });

      this.dep.reset({ throwOnPending: false });
    });

    it('sensibly prints mocks', function () {
      assert.deepStrictEqual(`${this.dep.mock({})}`, 'TCP{}');
      assert.deepStrictEqual(this.dep.mock({}).toString(), 'TCP{}');

      assert.deepStrictEqual(
        this.dep.mock({ init: 'bloop' }).toString(),
        "TCP{init='bloop'}"
      );

      assert.deepStrictEqual(
        this.dep.mock({ req: 'bloop', res: 'bleep' }).toString(),
        "TCP{req='bloop' res='bleep'}"
      );

      assert.deepStrictEqual(
        this.dep
          .mock({ req: /^blo+p$/, res: Buffer.from('bleep', 'utf8') })
          .toString(),
        'TCP{req=/^blo+p$/ res=<Buffer 62 6c 65 65 70>}'
      );

      assert.deepStrictEqual(
        this.dep.mock({ req: () => true, res: () => 'bloop' }).toString(),
        'TCP{req=[Function: req] res=[Function: res]}'
      );

      const myPredicate = () => true;
      const myBufferable = () => 'boop';
      assert.deepStrictEqual(
        this.dep.mock({ req: myPredicate, res: myBufferable }).toString(),
        'TCP{req=[Function: myPredicate] res=[Function: myBufferable]}'
      );

      this.dep.reset({ throwOnPending: false });
    });

    describe('supports many independent dependencies', function () {
      before(async function () {
        this.depA = await tcp();
        this.depB = await tcp();
      });

      afterEach(function () {
        this.depA.reset();
        this.depB.reset();
      });

      after(async function () {
        await this.depA.teardown();
        await this.depB.teardown();
      });

      it('mocks a tcp request', async function () {
        var aCallCount = 0;
        var bCallCount = 0;

        const mockA = this.depA.mock({
          req: (b) => {
            aCallCount = aCallCount + 1;
            return b.slice(-1)[0] === 97;
          },
          res: 'bloop from A',
        });

        const mockB = this.depB.mock({
          req: (b) => {
            bCallCount = bCallCount + 1;
            return b.slice(-1)[0] === 98;
          },
          res: 'bloop from B',
        });

        const clientA = await asyncSocket({ port: this.depA.port });
        const clientB = await asyncSocket({ port: this.depB.port });

        await clientA.write('b');
        await clientB.write('a');

        // Ensure enough time passes for writes to arrive.
        await wait(10);

        assert.strictEqual(aCallCount, 1);
        assert.strictEqual(bCallCount, 1);

        assert.throws(() => mockA.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: TCP{req=[Function: req] res='bloop from A'}",
        });

        assert.throws(() => mockB.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: TCP{req=[Function: req] res='bloop from B'}",
        });

        await clientA.write('a');
        await clientB.write('b');

        assert.deepStrictEqual(
          await clientA.read(),
          Buffer.from('bloop from A', 'utf8')
        );
        assert.deepStrictEqual(
          await clientB.read(),
          Buffer.from('bloop from B', 'utf8')
        );

        assert.strictEqual(aCallCount, 2);
        assert.strictEqual(bCallCount, 2);
      });
    });

    describe('supports mocking a specific port', function () {
      before(async function () {
        this.depWithKnownPort = await tcp({ port: 1989 });
      });

      afterEach(function () {
        this.depWithKnownPort.reset();
      });

      after(async function () {
        await this.depWithKnownPort.teardown();
      });

      it('mocks a tcp request', async function () {
        this.depWithKnownPort.mock({ req: 'abcd', res: '1234' });

        const client = await asyncSocket({ port: 1989 });

        client.write('abcd');
        const res = await client.read();

        assert.deepStrictEqual(res.toString('utf8'), '1234');

        client.end();
      });
    });
  });

  describe('init', function () {
    it('allows initializing a connection by string', async function () {
      this.dep.mock({ init: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows initializing a connection by buffer', async function () {
      this.dep.mock({ init: Buffer.from('bloop', 'utf8') });

      const client = await asyncSocket({ port: this.dep.port });
      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it(`consumes one init mock per connection`, async function () {
      this.dep.mock({ init: 'a' });
      this.dep.mock({ init: 'b' });

      const clientA = await asyncSocket({ port: this.dep.port });
      assert.deepStrictEqual((await clientA.read()).toString(), 'a');

      await assert.rejects(() => clientA.read(), {
        name: 'Error',
        message: 'Read timeout',
      });

      const clientB = await asyncSocket({ port: this.dep.port });
      assert.deepStrictEqual((await clientB.read()).toString(), 'b');
    });
  });

  describe('request matching', function () {
    it('allows matching any request', async function () {
      this.dep.mock({ res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('anything');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows matching by string', async function () {
      this.dep.mock({ req: 'bloop', res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows matching by buffer', async function () {
      this.dep.mock({ req: Buffer.from('bloop'), res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows matching by regex', async function () {
      this.dep.mock({ req: /^blo+p$/, res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('blooooooop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows matching by function', async function () {
      this.dep.mock({
        req: (r) => r.toString('utf8').endsWith('oop'),
        res: 'bloop',
      });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('blooooooop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });
  });

  describe('mock consumption', function () {
    it('consumes a mock when it matches', async function () {
      const mock = this.dep.mock({ req: 'bloop', res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));

      mock.assertDone();

      await client.write('bloop');
      await assert.rejects(() => client.read(), {
        name: 'Error',
        message: 'Read timeout',
      });
    });

    it('supports many of the same mock', async function () {
      for (let i = 0; i < 100; ++i) {
        this.dep.mock({ req: 'bloop', res: 'bloop' });
      }

      const client = await asyncSocket({ port: this.dep.port });

      for (let i = 0; i < 100; ++i) {
        await client.write('bloop');
        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('bloop', 'utf8')
        );
      }
    });
  });

  describe('response filling', function () {
    it('has sensible defaults', async function () {
      const client = await asyncSocket({ port: this.dep.port });

      this.dep.mock({ res: () => undefined });
      await client.write('bloop');

      await wait(10);

      this.dep.mock({
        res: () => ({
          body: () => undefined,
          bodyDelay: () => undefined,
          destroySocket: () => undefined,
        }),
      });

      await client.write('bloop');
    });

    it('allows setting body by string', async function () {
      this.dep.mock({ res: 'bloop' });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows setting body by buffer', async function () {
      this.dep.mock({ res: Buffer.from('bloop', 'utf8') });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(await client.read(), Buffer.from('bloop', 'utf8'));
    });

    it('allows setting response attributes by function (returning bufferable)', async function () {
      this.dep.mock({ res: (req) => `req: ${req}` });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(
        await client.read(),
        Buffer.from('req: bloop', 'utf8')
      );
    });

    it('allows setting response attributes by function (returning object)', async function () {
      this.dep.mock({ res: (req) => ({ body: `req: ${req}` }) });

      const client = await asyncSocket({ port: this.dep.port });
      await client.write('bloop');

      assert.deepStrictEqual(
        await client.read(),
        Buffer.from('req: bloop', 'utf8')
      );
    });

    describe('body', function () {
      it('allows setting body by string', async function () {
        this.dep.mock({ res: { body: 'bloop' } });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('bloop', 'utf8')
        );
      });

      it('allows setting body by buffer', async function () {
        this.dep.mock({ res: { body: Buffer.from('bloop', 'utf8') } });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('bloop', 'utf8')
        );
      });

      it('allows setting body by function (returning string)', async function () {
        this.dep.mock({ res: { body: (req) => `req: ${req}` } });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('req: bloop', 'utf8')
        );
      });

      it('allows setting body by function (returning buffer)', async function () {
        this.dep.mock({
          res: { body: (req) => Buffer.from(`req: ${req}`, 'utf8') },
        });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('req: bloop', 'utf8')
        );
      });
    });

    describe('bodyDelay', function () {
      it('allows setting a body delay by number', async function () {
        const start = new Date();
        this.dep.mock({ res: { body: 'bloop', bodyDelay: 50 } });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('bloop', 'utf8')
        );

        const end = new Date();
        assert(end - start >= 45);
      });

      it('allows setting a body delay by function', async function () {
        const start = new Date();
        this.dep.mock({
          res: {
            body: 'bloop',
            bodyDelay: (req) => parseInt(req.toString('utf8'), 10),
          },
        });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('50');

        assert.deepStrictEqual(
          await client.read(),
          Buffer.from('bloop', 'utf8')
        );

        const end = new Date();
        assert(end - start >= 45);
      });
    });

    describe('destroySocket', function () {
      it('hangs up a socket', async function () {
        this.dep.mock({ res: { body: 'bloop', destroySocket: true } });

        const client = await asyncSocket({ port: this.dep.port });
        await client.write('bloop');
        await client.closeSignal;
      });
    });
  });

  describe('fun examples', function () {
    it('can mock an http server', async function () {
      this.dep.mock({
        req: [
          'POST /v1/bloop HTTP/1.1',
          'content-type: application/json',
          'content-length: 18',
          'Connection: close',
          `Host: localhost:${this.dep.port}`,
          '',
          '{"status":"bloop"}',
        ].join('\r\n'),
        res: [
          'HTTP/1.1 200 OK',
          'Content-Type: application/json',
          'Content-Length: 16',
          'Connection: close',
          '',
          '{"data":"bloop"}',
        ].join('\r\n'),
      });

      const { res, json } = await req({
        port: this.dep.port,
        method: 'POST',
        pathname: '/v1/bloop',
        jsonBody: { status: 'bloop' },
        headers: { Connection: 'close' },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json');
      assert.strictEqual(res.headers['content-length'], '16');
      assert.deepStrictEqual(json, { data: 'bloop' });
    });

    it('can mock a redis server', async function () {
      this.dep.mock({
        req: ['*2', '$3', 'GET', '$15', 'namespace:bloop', ''].join('\r\n'),
        res: ['$17', 'bloop-the-big-one', ''].join('\r\n'),
      });

      const client = createClient({
        url: `redis://localhost:${this.dep.port}`,
      });

      await client.connect();
      const bloop = await client.get('namespace:bloop');

      assert.strictEqual(bloop, 'bloop-the-big-one');

      await client.disconnect();
    });

    it('can mock a memcached server', async function () {
      this.dep.mock({
        req: 'get bloop\r\n',
        res: 'VALUE bloop 0 17\r\nbloop the big one\r\nEND\r\n',
      });

      const client = new memcached(`localhost:${this.dep.port}`);

      const result = await new Promise((res, rej) => {
        client.get('bloop', function (err, data) {
          if (err) {
            rej(err);
          }

          res(data);
        });
      });

      assert.deepStrictEqual(result, 'bloop the big one');
      client.end();
    });

    it('can mock a divvy server', async function () {
      this.dep.mock({
        req: 'HIT "method"="GET" "path"="/pantry/cookies"\n',
        res: 'OK true 2 3600\n',
      });

      const client = new DivvyClient('localhost', this.dep.port);
      const res = await client.hit({ method: 'GET', path: '/pantry/cookies' });

      assert.deepStrictEqual(res, {
        currentCredit: 2,
        isAllowed: true,
        nextResetSeconds: 3600,
      });

      client.close();
    });

    it('can mock a mysql server', async function () {
      const handshake = this.dep.mock({
        init: hexBuffer`
          360000000a352e352e322d6d32000300
          000027753e6f3866794e00fff7080200
          00000000000000000000000000574d5d
          6a7c5368325c592e7300`,
      });

      const auth = handshake.mock({
        req: hexBuffer`
          3e000001cff306000000000021000000
          00000000000000000000000000000000
          000000006d650014ada8efd2477f1ba3
          43d1d29098c14503ea21c5006d795f64
          6200`,
        res: hexBuffer`0700000200000002000000`,
      });

      const query = auth.mock({
        req: hexBuffer`
          1900000003${Buffer.from('SELECT 1 + 1 AS solution', 'utf8')}`,
        res: hexBuffer`
          01000001011e00000203646566000000
          08736f6c7574696f6e000c3f00030000
          0008810000000005000003fe00000200
          02000004013205000005fe00000200`,
      });

      const client = mysql.createConnection({
        host: 'localhost',
        port: this.dep.port,
        user: 'me',
        password: 'secret',
        database: 'my_db',
      });

      const { results, fields } = await new Promise((resolve, reject) => {
        client.query('SELECT 1 + 1 AS solution', (err, results, fields) => {
          err !== null ? reject(err) : resolve({ results, fields });
        });
      });

      handshake.assertDone();
      auth.assertDone();
      query.assertDone();

      assert.deepStrictEqual(results[0].solution, 2);
      assert.deepStrictEqual(fields[0].name, 'solution');

      client.end();
    });

    it('can mock a postgres server', async function () {
      const serverSalt = 'zfLTJwV54d4WqVAKnhs9Hw==';
      const serverIterations = 4096;
      const password = 'mysecretpassword';

      // We'll stash the client and server nonce values for re-use across mocks.
      let clientNonce;
      let serverNonce;

      const startupMessage = this.dep.mock({
        req: hexBuffer`
          0000003e000300007573657200706f73
          74677265730064617461626173650070
          6f73746772657300636c69656e745f65
          6e636f64696e6700555446380000`,
        res: hexBuffer`
          52000000170000000a534352414d2d53
          48412d3235360000`,
      });

      const saslInitialResponse = startupMessage.mock({
        req: (bytes) => {
          // Assert the prefix of the message, up to the client nonce portion.
          const target = hexBuffer`
            7000000037534352414d2d5348412d32
            353600000000216e2c2c6e3d2a2c723d`;

          return (
            bytes.length === 56 && target.compare(bytes, 0, target.length) === 0
          );
        },
        res: (bytes) => {
          clientNonce = Buffer.from(
            bytes.toString('utf8').split('r=')[1],
            'utf8'
          );

          serverNonce = Buffer.concat([
            clientNonce,
            hexBuffer`44634f434b78514762792f5642385a75456b424234527779`,
          ]);

          const message = Buffer.from(
            `r=${serverNonce},s=${serverSalt},i=${serverIterations}`,
            'utf8'
          );

          return hexBuffer`520000005c0000000b${message}`;
        },
      });

      const saslResponse = saslInitialResponse.mock({
        req: (bytes) => {
          const target = hexBuffer`700000006c633d626977732c723d${serverNonce}2c703d`;
          return (
            bytes.length === 109 &&
            target.compare(bytes, 0, target.length) === 0
          );
        },
        res: () => {
          const signature = saslSignature({
            password,
            clientNonce,
            serverNonce,
            serverSalt,
            serverIterations,
          });

          return hexBuffer`
            52000000360000000c763d${signature}
            52000000080000000053000000166170
            706c69636174696f6e5f6e616d650000
            5300000019636c69656e745f656e636f
            64696e67005554463800530000001744
            6174655374796c650049534f2c204d44
            5900530000002664656661756c745f74
            72616e73616374696f6e5f726561645f
            6f6e6c79006f6666005300000017696e
            5f686f745f7374616e646279006f6666
            005300000019696e74656765725f6461
            746574696d6573006f6e00530000001b
            496e74657276616c5374796c6500706f
            73746772657300530000001469735f73
            7570657275736572006f6e0053000000
            197365727665725f656e636f64696e67
            00555446380053000000327365727665
            725f76657273696f6e0031342e342028
            44656269616e2031342e342d312e7067
            64673131302b31290053000000237365
            7373696f6e5f617574686f72697a6174
            696f6e00706f73746772657300530000
            00237374616e646172645f636f6e666f
            726d696e675f737472696e6773006f6e
            00530000001554696d655a6f6e650045
            74632f555443004b0000000c00002673
            72a74dad5a0000000549`;
        },
      });

      const query = saslResponse.mock({
        req: hexBuffer`
          510000001d53454c4543542031202b20
          3120415320736f6c7574696f6e00`,
        res: hexBuffer`
          54000000210001736f6c7574696f6e00
          000000000000000000170004ffffffff
          0000440000000b000100000001324300
          00000d53454c4543542031005a000000
          0549`,
      });

      const termination = query.mock({
        req: hexBuffer`5800000004`,
      });

      const client = new pg.Client({
        user: 'postgres',
        host: 'localhost',
        password,
        port: this.dep.port,
      });

      await client.connect();

      startupMessage.assertDone();
      saslInitialResponse.assertDone();
      saslResponse.assertDone();

      // Finally! Let's run a query!
      const result = await client.query('SELECT 1 + 1 AS solution');

      assert.deepStrictEqual(result.rows[0].solution, 2);
      query.assertDone();

      await client.end();
      termination.assertDone();
    });
  });
});
