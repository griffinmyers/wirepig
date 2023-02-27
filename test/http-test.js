import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { parse as parseQs } from 'node:querystring';

import { SQSClient, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

import { http, helpers } from '../src/index.js';
import { wait } from '../src/lib.js';
import { mockSchema } from '../src/http/schema.js';
import { req, sqsResponse } from './helpers/index.js';

const { match, res: resp } = helpers;

describe('http', function () {
  before(async function () {
    this.dep = await http();
  });

  afterEach(function () {
    this.dep.reset();
  });

  after(async function () {
    await this.dep.teardown();
  });

  describe('schema', function () {
    it('expects valid http arguments', async function () {
      let message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options` if defined must be plain object (got /bloop/)';

      assert.throws(() => http(/bloop/), {
        name: 'ValidationError',
        message,
      });

      message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options.port` if defined must be positive integer (got -2)';

      assert.throws(() => http({ port: -2 }), {
        name: 'ValidationError',
        message,
      });

      let server;
      try {
        server = await http({});
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
      assert.deepStrictEqual(mockSchema({}, ['options']), [{}, []]);
    });

    it('expects a valid mock req', function () {
      assert.deepStrictEqual(mockSchema({ req: 1989 }, ['options']), [
        { req: 1989 },
        [
          '`options.req` if defined must be plain object or function (got 1989)',
        ],
      ]);

      assert.deepStrictEqual(mockSchema({ req: {} }, ['options']), [
        { req: {} },
        [],
      ]);

      const r = mockSchema({ req: () => 'bloop' }, ['options']);
      assert.deepStrictEqual(r[1], []);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `options.req()` must be boolean (got 'bloop')";

      assert.throws(() => r[0].req(), { name: 'ValidationError', message });

      assert.deepStrictEqual(
        mockSchema(
          {
            req: {
              method: 1989,
              pathname: 1989,
              query: 1989,
              headers: 1989,
              body: 1989,
            },
          },
          ['options']
        ),
        [
          {
            req: {
              method: 1989,
              pathname: 1989,
              query: 1989,
              headers: 1989,
              body: 1989,
            },
          },
          [
            '`options.req.method` if defined must be string, buffer, regular expression, or function (got 1989)',
            '`options.req.pathname` if defined must be string, buffer, regular expression, or function (got 1989)',
            '`options.req.query` if defined must be string, buffer, regular expression, or function (got 1989)',
            '`options.req.headers` if defined must be plain object or function (got 1989)',
            '`options.req.body` if defined must be string, buffer, regular expression, or function (got 1989)',
          ],
        ]
      );

      assert.deepStrictEqual(
        mockSchema(
          {
            req: {
              method: 'GET',
              pathname: /bloop/,
              query: Buffer.from('bloop', 'utf8'),
              headers: () => {},
              body: () => {},
            },
          },
          ['options']
        )[1],

        []
      );

      assert.deepStrictEqual(
        mockSchema(
          {
            req: {
              headers: {
                'x-bloop': 1989,
                'x-string': 'string',
                'x-buffer': Buffer.from('bloop', 'utf8'),
                'x-regexp': /bloop/,
                'x-function': () => {},
                'x-arr': [
                  'x-valid',
                  Buffer.from('valid', 'utf8'),
                  /valid/,
                  () => 0,
                  undefined,
                ],
                'x-arr-invalid': ['bloop', 1989, {}],
              },
            },
          },
          ['options']
        )[1],
        [
          '`options.req.headers.x-bloop` must be string, buffer, regular expresson, function, or array of same (got 1989)',
          '`options.req.headers.x-arr-invalid.1` if defined must be string, buffer, regular expression, or function (got 1989)',
          '`options.req.headers.x-arr-invalid.2` if defined must be string, buffer, regular expression, or function (got {})',
        ]
      );
    });

    it('expects a valid mock res', function () {
      assert.deepStrictEqual(mockSchema({ res: 1989 }, ['options']), [
        { res: 1989 },
        [
          '`options.res` if defined must be plain object or function returning same (got 1989)',
        ],
      ]);

      assert.deepStrictEqual(mockSchema({ res: {} }, ['options']), [
        { res: {} },
        [],
      ]);

      let r = mockSchema({ res: () => 'bloop' }, ['options']);
      assert.deepStrictEqual(r[1], []);

      let message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `options.res()` if defined must be plain object (got 'bloop')";

      assert.throws(() => r[0].res(), { name: 'ValidationError', message });

      assert.deepStrictEqual(
        mockSchema(
          {
            res: {
              body: 1989,
              statusCode: 'bloop',
              headers: 1989,
              headerDelay: -1,
              bodyDelay: 'bloop',
            },
          },
          ['options']
        ),
        [
          {
            res: {
              body: 1989,
              statusCode: 'bloop',
              headers: 1989,
              headerDelay: -1,
              bodyDelay: 'bloop',
            },
          },
          [
            '`options.res.body` if defined must be string, buffer, or function returning same (got 1989)',
            '`options.res.headers` if defined must be plain object or function returning same (got 1989)',
            "`options.res.statusCode` if defined must be valid HTTP status code or function returning same (got 'bloop')",
            '`options.res.headerDelay` if defined must be positive integer or function returning same (got -1)',
            "`options.res.bodyDelay` if defined must be positive integer or function returning same (got 'bloop')",
          ],
        ]
      );

      assert.deepStrictEqual(
        mockSchema(
          {
            res: {
              body: '1989',
              statusCode: 3,
              headers: () => 0,
              headerDelay: () => 0,
              bodyDelay: 2,
              destroySocket: /oof/,
            },
          },
          ['options']
        )[1],
        [
          '`options.res.statusCode` if defined must be valid HTTP status code or function returning same (got 3)',
          '`options.res.destroySocket` if defined must be boolean or function returning same (got /oof/)',
        ]
      );

      r = mockSchema({ res: { statusCode: () => 0 } }, ['options']);
      assert.deepStrictEqual(r[1], []);

      message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options.res.statusCode()` if defined must be valid HTTP status code (got 0)';

      assert.throws(() => r[0].res.statusCode(), {
        name: 'ValidationError',
        message,
      });

      assert.deepStrictEqual(
        mockSchema({ res: { statusCode: 200 } }, ['options']),
        [{ res: { statusCode: 200 } }, []]
      );

      assert.deepStrictEqual(
        mockSchema(
          {
            res: {
              headers: {
                'x-bloop': 1989,
                'x-string': 'string',
                'x-buffer': Buffer.from('bloop', 'utf8'),
                'x-regexp': /bloop/,
                'x-function': () => 0,
              },
            },
          },
          ['options']
        )[1],
        [
          '`options.res.headers.x-bloop` if defined must be string, buffer, or function returning same (got 1989)',
          '`options.res.headers.x-regexp` if defined must be string, buffer, or function returning same (got /bloop/)',
        ]
      );
    });
  });

  describe('basics', function () {
    it('validates mock options', function () {
      const message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `options.req` if defined must be plain object or function (got 1989)\n' +
        '  * `options.res.statusCode` if defined must be valid HTTP status code or function returning same (got 3)';

      assert.throws(
        () => this.dep.mock({ req: 1989, res: { statusCode: 3 } }),
        {
          name: 'ValidationError',
          message,
        }
      );
    });

    it('mocks an http request', async function () {
      // Initiate a mock
      const mock = this.dep.mock({
        req: { method: 'GET', pathname: '/' },
        res: resp.json({ data: 'bloop' }),
      });

      // Perform a request. This would most likely be against something like an
      // HTTP server.
      const { res, json } = await req({ port: this.dep.port });

      // Assert that a network dependency was invoked.
      mock.assertDone();

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json');
      assert.strictEqual(res.headers['content-length'], '16');
      assert.deepStrictEqual(json, { data: 'bloop' });
    });

    it('fails with no matching mock', async function () {
      const mock = this.dep.mock({
        req: { method: 'POST', pathname: '/' },
        res: resp.json({ data: 'bloop' }),
      });

      await req({ port: this.dep.port });

      assert.throws(() => mock.assertDone(), {
        name: 'PendingMockError',
        message:
          "Mock is still pending: HTTP{req={ method: 'POST', pathname: '/' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });

      assert.throws(() => this.dep.reset(), {
        name: 'PendingMockError',
        message:
          "The following mocks are still pending: HTTP{req={ method: 'POST', pathname: '/' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });
    });

    it('reset() fails with many unmatched mocks', async function () {
      this.dep.mock({
        req: { method: 'POST', pathname: '/' },
        res: resp.json({ data: 'bloop' }),
      });

      this.dep.mock({
        req: { method: 'GET', pathname: '/bloop' },
        res: resp.json({ data: 'bloop' }),
      });

      assert.throws(() => this.dep.reset(), {
        name: 'PendingMockError',
        message:
          "The following mocks are still pending: HTTP{req={ method: 'POST', pathname: '/' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}, HTTP{req={ method: 'GET', pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });
    });

    it('reset({ throwOnPending: false }) succeeds with many unmatched mocks', async function () {
      this.dep.mock({
        req: { method: 'POST', pathname: '/' },
        res: resp.json({ data: 'bloop' }),
      });

      this.dep.mock({
        req: { method: 'GET', pathname: '/bloop' },
        res: resp.json({ data: 'bloop' }),
      });

      this.dep.reset({ throwOnPending: false });
    });

    it('sensibly prints mocks', function () {
      assert.deepStrictEqual(`${this.dep.mock({})}`, 'HTTP{}');
      assert.deepStrictEqual(this.dep.mock({}).toString(), 'HTTP{}');

      assert.deepStrictEqual(
        this.dep.mock({ req: { body: 'bloop' } }).toString(),
        "HTTP{req={ body: 'bloop' }}"
      );

      assert.deepStrictEqual(
        this.dep
          .mock({ req: { body: 'bloop' }, res: { body: 'bleep' } })
          .toString(),
        "HTTP{req={ body: 'bloop' } res={ body: 'bleep' }}"
      );

      assert.deepStrictEqual(
        this.dep
          .mock({
            req: {
              body: /bloop/,
              pathname: () => true,
              query: Buffer.from('?oof'),
              headers: {
                string: 'string',
                buffer: Buffer.from('b', 'utf8'),
                f: () => true,
                regexp: /oof/,
                arr: ['etc'],
              },
            },
            res: {
              body: 'bleep',
              headers: {
                string: 'string',
                buffer: Buffer.from('oof', 'utf8'),
                f: () => 'str',
              },
              statusCode: 404,
              headerDelay: () => 2,
              bodyDelay: 4,
              destroySocket: false,
            },
          })
          .toString(),
        "HTTP{req={ body: /bloop/, pathname: [Function: pathname], query: <Buffer 3f 6f 6f 66>, headers: { string: 'string', buffer: <Buffer 62>, f: [Function: f], regexp: /oof/, arr: [ 'etc' ] } } res={ body: 'bleep', headers: { string: 'string', buffer: <Buffer 6f 6f 66>, f: [Function: f] }, statusCode: 404, headerDelay: [Function: headerDelay], bodyDelay: 4, destroySocket: false }}"
      );

      const myPredicate = () => true;
      const myBufferable = () => 'boop';
      assert.deepStrictEqual(
        this.dep.mock({ req: myPredicate, res: myBufferable }).toString(),
        'HTTP{req=[Function: myPredicate] res=[Function: myBufferable]}'
      );

      this.dep.reset({ throwOnPending: false });
    });

    describe('supports many independent dependencies', function () {
      before(async function () {
        this.depA = await http();
        this.depB = await http();
      });

      afterEach(function () {
        this.depA.reset();
        this.depB.reset();
      });

      after(async function () {
        await this.depA.teardown();
        await this.depB.teardown();
      });

      it('mocks an http request', async function () {
        const mockA = this.depA.mock({
          req: { method: 'GET', pathname: '/a' },
          res: resp.json({ data: 'bloop from A' }),
        });

        const mockB = this.depB.mock({
          req: { method: 'GET', pathname: '/b' },
          res: resp.json({ data: 'bloop from B' }),
        });

        await req({ port: this.depA.port, pathname: '/b' });
        await req({ port: this.depB.port, pathname: '/a' });

        assert.throws(() => mockA.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: 'GET', pathname: '/a' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 20 66 72 6f 6d 20 41 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '23' } }}",
        });

        assert.throws(() => mockB.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: 'GET', pathname: '/b' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 20 66 72 6f 6d 20 42 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '23' } }}",
        });

        const { json: resA } = await req({
          port: this.depA.port,
          pathname: '/a',
        });
        const { json: resB } = await req({
          port: this.depB.port,
          pathname: '/b',
        });

        assert.deepStrictEqual(resA, { data: 'bloop from A' });
        assert.deepStrictEqual(resB, { data: 'bloop from B' });
      });
    });

    describe('supports mocking a specific port', function () {
      before(async function () {
        this.depWithKnownPort = await http({ port: 1989 });
      });

      afterEach(function () {
        this.depWithKnownPort.reset();
      });

      after(async function () {
        await this.depWithKnownPort.teardown();
      });

      it('mocks an http request', async function () {
        this.depWithKnownPort.mock({
          req: { method: 'GET', pathname: '/' },
          res: resp.json({ data: 'bloop' }),
        });

        const { res, json } = await req({ port: 1989 });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['content-type'], 'application/json');
        assert.strictEqual(res.headers['content-length'], '16');
        assert.deepStrictEqual(json, { data: 'bloop' });
      });
    });
  });

  describe('request matching', function () {
    it('allows matching any request', async function () {
      const mock = this.dep.mock({
        res: resp.json({ data: 'bloop' }),
      });

      assert.throws(() => mock.assertDone(), {
        name: 'PendingMockError',
        message:
          "Mock is still pending: HTTP{res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bloop',
      });

      mock.assertDone();

      this.dep.mock({
        res: resp.json({ data: 'bloop' }),
      });

      await req({
        port: this.dep.port,
        method: 'PATCH',
        pathname: '/blarp',
      });
    });

    it('must match every key specified', async function () {
      const mock = this.dep.mock({
        req: { method: 'GET', pathname: '/bloop' },
        res: resp.json({ data: 'bloop' }),
      });

      await req({
        port: this.dep.port,
        method: 'POST',
        pathname: '/bloop',
      });

      assert.throws(() => mock.assertDone(), {
        name: 'PendingMockError',
        message:
          "Mock is still pending: HTTP{req={ method: 'GET', pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bleep',
      });

      assert.throws(() => mock.assertDone(), {
        name: 'PendingMockError',
        message:
          "Mock is still pending: HTTP{req={ method: 'GET', pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bloop',
      });
    });

    it('matches all unspecified keys', async function () {
      const mock = this.dep.mock({
        req: { pathname: '/bloop' },
        res: resp.json({ data: 'bloop' }),
      });

      assert.throws(() => mock.assertDone(), {
        name: 'PendingMockError',
        message:
          "Mock is still pending: HTTP{req={ pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
      });

      await req({
        port: this.dep.port,
        method: 'PUT',
        pathname: '/bloop',
      });

      mock.assertDone();

      this.dep.mock({
        req: { pathname: '/bloop' },
        res: resp.json({ data: 'bloop' }),
      });

      await req({
        port: this.dep.port,
        method: 'PATCH',
        pathname: '/bloop',
      });
    });

    it('allows matching by function', async function () {
      const mock = this.dep.mock({
        req: (r) =>
          r.method.length === 3 &&
          r.pathname.startsWith('/blo') &&
          Object.keys(r.headers).length === 5 &&
          r.body.equals(Buffer.from('bloop', 'utf8')),
        res: resp.json({ data: 'bloop' }),
      });

      assert.throws(() => mock.assertDone(), { name: 'PendingMockError' });

      await req({
        port: this.dep.port,
        method: 'PATCH',
      });

      assert.throws(() => mock.assertDone(), { name: 'PendingMockError' });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/oof',
      });

      assert.throws(() => mock.assertDone(), { name: 'PendingMockError' });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bloop',
        headers: { 'x-bloop': 'true' },
      });

      assert.throws(() => mock.assertDone(), { name: 'PendingMockError' });

      // #req will add `Content-Type` and `Content-Length`, and node will add
      // `Host` and `Connection` headers, so to get our desired 5, we must set
      // one custom one.
      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bloop',
        headers: { 'x-bloop': 'true' },
        bufferBody: 'bleep',
      });

      assert.throws(() => mock.assertDone(), { name: 'PendingMockError' });

      await req({
        port: this.dep.port,
        method: 'GET',
        pathname: '/bloop',
        headers: { 'x-bloop': 'true' },
        bufferBody: 'bloop',
      });
    });

    describe('method', function () {
      it('allows matching method by string', async function () {
        const mock = this.dep.mock({
          req: { method: 'PUT' },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: 'PUT' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'POST',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: 'PUT' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'PUT',
        });
      });

      it('allows matching method by buffer', async function () {
        const mock = this.dep.mock({
          req: { method: Buffer.from('PUT', 'utf8') },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: <Buffer 50 55 54> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'POST',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: <Buffer 50 55 54> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'PUT',
        });
      });

      it('allows matching method by regexp', async function () {
        const mock = this.dep.mock({
          req: { method: /^(?:GET|PATCH)$/ },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: /^(?:GET|PATCH)$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'PUT',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ method: /^(?:GET|PATCH)$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          method: 'GET',
        });
      });

      it('allows matching method by function', async function () {
        const mock = this.dep.mock({
          req: { method: (m) => m.length === 3 },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: /^Mock is still pending:/,
        });

        await req({
          port: this.dep.port,
          method: 'PATCH',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: /^Mock is still pending:/,
        });

        await req({
          port: this.dep.port,
          method: 'GET',
        });
      });
    });

    describe('pathname', function () {
      it('allows matching pathname by string', async function () {
        const mock = this.dep.mock({
          req: { pathname: '/bloop' },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/blop',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
        });
      });

      it('allows matching pathname by buffer', async function () {
        const mock = this.dep.mock({
          req: { pathname: Buffer.from('/bloop', 'utf8') },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: <Buffer 2f 62 6c 6f 6f 70> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/blop',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: <Buffer 2f 62 6c 6f 6f 70> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
        });
      });

      it('allows matching pathname by regexp', async function () {
        const mock = this.dep.mock({
          req: { pathname: /^\/blo{2,}p$/ },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: /^\\/blo{2,}p$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/blop',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: /^\\/blo{2,}p$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/blooooooooooop',
        });
      });

      it('allows matching pathname by function', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: (p) => p.split('').filter((c) => c === 'o').length >= 2,
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: /^Mock is still pending:/,
        });

        await req({
          port: this.dep.port,
          pathname: '/blop',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: /^Mock is still pending:/,
        });

        await req({
          port: this.dep.port,
          pathname: '/blooooooooooop',
        });
      });
    });

    describe('query', function () {
      it('allows matching query by string', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: '/bloop',
            query: '?bloop=true&bleep=1&bleep=2',
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: '?bloop=true&bleep=1&bleep=2' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=1',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: '?bloop=true&bleep=1&bleep=2' } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=2',
        });
      });

      it('allows matching query by buffer', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: '/bloop',
            query: Buffer.from('?bloop=true&bleep=1&bleep=2', 'utf8'),
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: <Buffer 3f 62 6c 6f 6f 70 3d 74 72 75 65 26 62 6c 65 65 70 3d 31 26 62 6c 65 65 70 3d 32> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=1',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: <Buffer 3f 62 6c 6f 6f 70 3d 74 72 75 65 26 62 6c 65 65 70 3d 31 26 62 6c 65 65 70 3d 32> } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=2',
        });
      });

      it('allows matching query by regexp', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: '/bloop',
            query: /^\?(?:bl[oe]{2,}p=\d&?){3,}$/,
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: /^\\?(?:bl[oe]{2,}p=\\d&?){3,}$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=1',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: /^\\?(?:bl[oe]{2,}p=\\d&?){3,}$/ } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=3&bleep=1&bleep=2',
        });
      });

      it('allows matching query by function', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: '/bloop',
            query: (q) => {
              const parsed = parseQs(q);
              return (
                parseInt(parsed.bleep[0], 10) +
                  parseInt(parsed.bleep[1], 10) ===
                7
              );
            },
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: [Function: query] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=1',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: [Function: query] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=3&bleep=3&bleep=4',
        });
      });

      it('allows matching query with a deep comparison of values', async function () {
        const mock = this.dep.mock({
          req: {
            pathname: '/bloop',
            query: match.query({ bleep: ['3', '4'], bloop: '3' }),
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: [Function (anonymous)] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=true&bleep=1&bleep=1',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ pathname: '/bloop', query: [Function (anonymous)] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          pathname: '/bloop',
          query: '?bloop=3&bleep=3&bleep=4',
        });
      });
    });

    describe('headers', function () {
      it('allows matching headers by string', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'x-bloop': 'true' } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'false' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true' },
        });
      });

      it('allows matching headers by buffer', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'x-bloop': Buffer.from('bloop', 'utf8') } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': <Buffer 62 6c 6f 6f 70> } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'blop' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': <Buffer 62 6c 6f 6f 70> } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'bloop' },
        });
      });

      it('allows matching headers by regexp', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'x-bloop': /bl[oe]{2}p/ } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': /bl[oe]{2}p/ } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'blop' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': /bl[oe]{2}p/ } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'bloop' },
        });
      });

      it('allows matching headers by function', async function () {
        const mock = this.dep.mock({
          req: {
            headers: (h) =>
              parseInt(h['x-bloop'], 10) + parseInt(h['x-bleep'], 10) === 10,
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: [Function: headers] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': '8', 'x-bleep': '1' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: [Function: headers] } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': '8', 'x-bleep': '2' },
        });
      });

      it('allows matching headers by key function', async function () {
        const mock = this.dep.mock({
          req: {
            headers: {
              'x-bloop': (v) =>
                v.length === 5 && v.startsWith('blo') && v.endsWith('op'),
            },
          },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': [Function: x-bloop] } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'blop' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': [Function: x-bloop] } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'bloop' },
        });
      });

      it('allows matching headers while ignoring unspecified headers', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'x-bloop': 'true' } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true', 'x-blorp': false },
        });
      });

      it('allows matching headers, case-sensitive', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'X-Bloop': 'true' } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'X-Bloop': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'X-Bloop': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'X-Bloop': 'true' },
        });

        mock.assertDone();

        const funcMock = this.dep.mock({
          req: { headers: { 'X-Bloop': (v) => v.endsWith('oop') } },
          res: resp.json({ data: 'bloop' }),
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'bloop' },
        });

        assert.throws(() => funcMock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'X-Bloop': [Function: X-Bloop] } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'X-Bloop': 'bloop' },
        });
      });

      it('allows matching headers with duplicated field names', async function () {
        const mock = this.dep.mock({
          req: {
            headers: { 'X-BLOOP': ['true', 'false'], 'x-BLOOP': 'bloopin' },
          },
          res: resp.json({ data: 'bloop' }),
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'X-BLOOP': [ 'true', 'false' ], 'x-BLOOP': 'bloopin' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: [
            'X-BLOOP',
            'true',
            'X-BLOOP',
            'false',
            'x-BLOOP',
            'bloopin',
          ],
        });

        mock.assertDone();

        this.dep.mock({
          req: {
            headers: {
              'x-bloop': [
                'string',
                /^blo+p$/,
                Buffer.from('bleep', 'utf8'),
                (v) => v.endsWith('oop'),
              ],
            },
          },
          res: resp.json({ data: 'bloop' }),
        });

        await req({
          port: this.dep.port,
          headers: [
            'x-bloop',
            'string',
            'x-bloop',
            'blooooooop',
            'x-bloop',
            'bleep',
            'x-bloop',
            'baloop',
          ],
        });
      });

      it('allows matching multiple headers', async function () {
        const mock = this.dep.mock({
          req: { headers: { 'x-bloop': 'true', 'x-bleep': 'true' } },
          res: resp.json({ data: 'bloop' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true', 'x-bleep': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true', 'x-bleep': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bleep': 'true' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message:
            "Mock is still pending: HTTP{req={ headers: { 'x-bloop': 'true', 'x-bleep': 'true' } } res={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}",
        });

        await req({
          port: this.dep.port,
          headers: { 'x-bloop': 'true', 'x-bleep': 'true' },
        });
      });

      it('allows undefined headers', async function () {
        this.dep.mock({
          req: { headers: { 'x-bleep': undefined } },
          res: resp.json({ data: 'bloop' }),
        });

        await req({ port: this.dep.port, headers: { 'x-bleep': 'oof' } });
      });
    });

    describe('body', function () {
      it('allows matching request bodies by string', async function () {
        const mock = this.dep.mock({
          req: { body: `{"data":"bloop"}` },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: '{"data":"bloop"}' } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { data: 'blorp' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: '{"data":"bloop"}' } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { data: 'bloop' },
        });
      });

      it('allows matching request bodies by buffer', async function () {
        const mock = this.dep.mock({
          req: { body: Buffer.from(`{"data":"bloop"}`, 'utf8') },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d> } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { data: 'blorp' },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: <Buffer 7b 22 64 61 74 61 22 3a 22 62 6c 6f 6f 70 22 7d> } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { data: 'bloop' },
        });
      });

      it('allows matching request bodies by regexp', async function () {
        const mock = this.dep.mock({
          req: { body: /^blo{2,}p$/ },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: /^blo{2,}p$/ } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          bufferBody: Buffer.from('blorp', 'utf8'),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: /^blo{2,}p$/ } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          bufferBody: Buffer.from('bloop', 'utf8'),
        });
      });

      it('allows matching request bodies by function', async function () {
        const mock = this.dep.mock({
          req: { body: (b) => JSON.parse(b)['number'] % 2 === 0 },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: [Function: body] } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          bufferBody: 'bloop the bork one',
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: [Function: body] } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { number: 1 },
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: [Function: body] } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { number: 2 },
        });
      });

      it('allows matching request bodies with a deep comparison of JSON values', async function () {
        const mock = this.dep.mock({
          req: { body: match.json({ meta: 'ok', data: 'bloop' }) },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: [Function (anonymous)] } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          jsonBody: { data: 'bloop', meta: 'ok' },
          headers: { 'content-type': 'application/json; charset=utf8' },
        });
      });

      it('allows matching request bodies with a deep comparison of form values', async function () {
        const mock = this.dep.mock({
          req: {
            body: match.form({ bloop: 'real friends', filter: ['4', '5'] }),
          },
          res: resp.json({ success: 'ok' }),
        });

        assert.throws(() => mock.assertDone(), {
          name: 'PendingMockError',
          message: `Mock is still pending: HTTP{req={ body: [Function (anonymous)] } res={ body: <Buffer 7b 22 73 75 63 63 65 73 73 22 3a 22 6f 6b 22 7d>, statusCode: 200, headers: { 'content-type': 'application/json', 'content-length': '16' } }}`,
        });

        await req({
          port: this.dep.port,
          bufferBody: Buffer.from(
            'filter=4&bloop=real%20friends&filter=5',
            'utf8'
          ),
        });
      });
    });
  });

  describe('mock consumption', function () {
    it('consumes a mock when it matches', async function () {
      const mock = this.dep.mock({
        req: { method: 'GET', pathname: '/' },
        res: resp.json({ data: 'bloop' }),
      });

      const { res, json } = await req({ port: this.dep.port });
      mock.assertDone();

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json');
      assert.deepStrictEqual(json, { data: 'bloop' });

      const { res: res2, responseBody } = await req({
        port: this.dep.port,
        method: 'PUT',
        pathname: '/bloop',
        query: '?sort=asc',
      });
      mock.assertDone();

      assert.strictEqual(res2.statusCode, 404);
      assert.strictEqual(res2.headers['content-type'], 'text/plain');
      assert.deepStrictEqual(
        responseBody,
        'No matching mock was found for [PUT /bloop?sort=asc HTTP/1.1]'
      );
    });

    it('supports many of the same mock', async function () {
      for (let i = 0; i < 100; ++i) {
        this.dep.mock({
          req: { method: 'GET', pathname: '/' },
          res: resp.json({ data: 'bloop' }),
        });
      }

      for (let i = 0; i < 100; ++i) {
        const { res, json } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['content-type'], 'application/json');
        assert.strictEqual(res.headers['content-length'], '16');
        assert.deepStrictEqual(json, { data: 'bloop' });
      }
    });
  });

  describe('response filling', function () {
    it('allows setting response attributes', async function () {
      this.dep.mock({
        res: {
          body: 'bloop the big one',
          statusCode: 418,
          headers: {
            'content-type': 'text/plain',
            'content-length': '17',
            'x-bloop': 'true',
          },
        },
      });

      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 418);
      assert.strictEqual(res.headers['content-type'], 'text/plain');
      assert.strictEqual(res.headers['content-length'], '17');
      assert.strictEqual(res.headers['x-bloop'], 'true');
      assert.deepStrictEqual(responseBody, 'bloop the big one');
    });

    it('allows setting response attributes by function', async function () {
      this.dep.mock({
        res: (req, reqBody) => ({
          body: Buffer.from(`req: ${reqBody}`, 'utf8'),
          statusCode: 200,
          headers: {
            'content-type': 'text/plain',
            'content-length': '22',
            'x-method': req.method,
            'x-url': req.url,
          },
        }),
      });

      const { res, responseBody } = await req({
        port: this.dep.port,
        pathname: '/big-bloopin',
        bufferBody: Buffer.from('bloop the big one', 'utf8'),
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'text/plain');
      assert.strictEqual(res.headers['content-length'], '22');
      assert.strictEqual(res.headers['x-method'], 'GET');
      assert.strictEqual(res.headers['x-url'], '/big-bloopin');
      assert.deepStrictEqual(responseBody, 'req: bloop the big one');
    });

    it('has defaults for all response attributes (no obj)', async function () {
      this.dep.mock();
      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
      assert(res.headers['connection'].length > 0);
      assert(res.headers['date'].length > 0);
      assert.deepStrictEqual(responseBody, '');
    });

    it('has defaults for all response attributes (empty obj)', async function () {
      this.dep.mock({});
      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
      assert(res.headers['connection'].length > 0);
      assert(res.headers['date'].length > 0);
      assert.deepStrictEqual(responseBody, '');
    });

    it('has defaults for all response attributes (() => undefined)', async function () {
      this.dep.mock({ res: () => undefined });
      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
      assert(res.headers['connection'].length > 0);
      assert(res.headers['date'].length > 0);
      assert.deepStrictEqual(responseBody, '');
    });

    it('has defaults for all response attributes (key () => undefined)', async function () {
      this.dep.mock({
        res: {
          body: () => undefined,
          statusCode: () => undefined,
          headers: () => undefined,
          headerDelay: () => undefined,
          bodyDelay: () => undefined,
          destroySocket: () => undefined,
        },
      });

      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
      assert(res.headers['connection'].length > 0);
      assert(res.headers['date'].length > 0);
      assert.deepStrictEqual(responseBody, '');
    });

    it('has defaults for all response attributes (header () => undefined)', async function () {
      this.dep.mock({
        res: {
          headers: { 'x-bloop': () => undefined },
        },
      });

      const { res, responseBody } = await req({ port: this.dep.port });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked');
      assert(res.headers['connection'].length > 0);
      assert(res.headers['date'].length > 0);
      assert.deepStrictEqual(responseBody, '');
    });

    describe('body', function () {
      it('allows setting body by string', async function () {
        this.dep.mock({ res: { body: 'bloop the big one' } });
        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(responseBody, 'bloop the big one');
      });

      it('allows setting body by buffer', async function () {
        this.dep.mock({
          res: { body: Buffer.from('bloop the big one', 'utf8') },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(responseBody, 'bloop the big one');
      });

      it('allows setting body by function (returning string)', async function () {
        this.dep.mock({
          res: { body: (req, reqBody) => `req: ${reqBody}` },
        });

        const { res, responseBody } = await req({
          port: this.dep.port,
          bufferBody: Buffer.from('bloop the big one', 'utf8'),
        });

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(responseBody, 'req: bloop the big one');
      });

      it('allows setting body by function (returning buffer)', async function () {
        this.dep.mock({
          res: {
            body: (req, reqBody) => Buffer.from(`req: ${reqBody}`, 'utf8'),
          },
        });

        const { res, responseBody } = await req({
          port: this.dep.port,
          bufferBody: Buffer.from('bloop the big one', 'utf8'),
        });

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(responseBody, 'req: bloop the big one');
      });
    });

    describe('statusCode', function () {
      it('allows setting statusCode by integer', async function () {
        this.dep.mock({ res: { statusCode: 404 } });
        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 404);
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting statusCode by function', async function () {
        this.dep.mock({
          res: { statusCode: (req) => parseInt(req.headers['x-code'], 10) },
        });

        const { res, responseBody } = await req({
          port: this.dep.port,
          headers: { 'x-code': '301' },
        });

        assert.strictEqual(res.statusCode, 301);
        assert.deepStrictEqual(responseBody, '');
      });
    });

    describe('headers', function () {
      it('allows setting headers by string', async function () {
        this.dep.mock({
          res: { headers: { 'x-bloop': 'true' } },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-bloop'], 'true');
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting headers by buffer', async function () {
        this.dep.mock({
          res: { headers: { 'x-bloop': Buffer.from('true', 'utf8') } },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-bloop'], 'true');
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting headers by function', async function () {
        this.dep.mock({
          res: {
            headers: (req, reqBody) => ({
              'x-method': req.method,
              'x-body': reqBody,
            }),
          },
        });

        const { res, responseBody } = await req({
          port: this.dep.port,
          bufferBody: Buffer.from('bloop the big one', 'utf8', 'utf8'),
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-method'], 'GET');
        assert.strictEqual(res.headers['x-body'], 'bloop the big one');
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting headers by function that returns obj of function', async function () {
        this.dep.mock({
          res: {
            headers: (req) => ({
              'x-method': () => req.method,
            }),
          },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-method'], 'GET');
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting headers by key function (returning string)', async function () {
        this.dep.mock({
          res: { headers: { 'x-method': (req) => req.method } },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-method'], 'GET');
        assert.deepStrictEqual(responseBody, '');
      });

      it('allows setting headers by key function (returning buffer)', async function () {
        this.dep.mock({
          res: {
            headers: { 'x-method': (req) => Buffer.from(req.method, 'utf8') },
          },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-method'], 'GET');
        assert.deepStrictEqual(responseBody, '');
      });

      it('coerces undefined to empty string', async function () {
        this.dep.mock({
          res: { headers: { 'x-bloop': undefined } },
        });

        const { res, responseBody } = await req({ port: this.dep.port });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-bloop'], '');
        assert.deepStrictEqual(responseBody, '');
      });
    });

    describe('headerDelay', function () {
      it('allows setting a header delay by number', async function () {
        const start = new Date();
        let receivedHeaders = null;
        this.dep.mock({ res: { headerDelay: 100 } });

        const events = [];

        const first = req({
          port: this.dep.port,
          onEvent: (n) => {
            events.push(`first ${n}`);
            receivedHeaders = new Date();
          },
        }).then(({ res }) =>
          events.push(`first res recieved: ${res.statusCode}`)
        );

        await wait(10);

        const second = req({
          port: this.dep.port,
          onEvent: (n) => events.push(`second ${n}`),
        }).then(({ res }) =>
          events.push(`second res recieved: ${res.statusCode}`)
        );

        await Promise.all([first, second]);
        const end = new Date();

        assert.deepStrictEqual(events, [
          'second received-headers',
          'second res recieved: 404',
          'first received-headers',
          'first res recieved: 200',
        ]);

        assert(end - start >= 100);
        assert(receivedHeaders - start >= 100);
        assert(end - receivedHeaders < 5);
      });

      it('allows setting a header delay by function', async function () {
        const start = new Date();

        this.dep.mock({
          res: { headerDelay: (req) => parseInt(req.headers['x-delay'], 10) },
        });

        await req({ port: this.dep.port, headers: { 'x-delay': '50' } });

        const end = new Date();
        assert(end - start >= 50);
      });
    });

    describe('bodyDelay', function () {
      it('allows setting a body delay by number', async function () {
        const start = new Date();
        let receivedHeaders = null;
        this.dep.mock({ res: { ...resp.text('bloop'), bodyDelay: 100 } });

        const events = [];

        const first = req({
          port: this.dep.port,
          onEvent: (n) => {
            events.push(`first ${n}`);
            receivedHeaders = new Date();
          },
        }).then(({ res }) =>
          events.push(`first res recieved: ${res.statusCode}`)
        );

        await wait(10);

        const second = req({
          port: this.dep.port,
          onEvent: (n) => events.push(`second ${n}`),
        }).then(({ res }) =>
          events.push(`second res recieved: ${res.statusCode}`)
        );

        await Promise.all([first, second]);
        const end = new Date();

        assert.deepStrictEqual(events, [
          'first received-headers',
          'second received-headers',
          'second res recieved: 404',
          'first res recieved: 200',
        ]);

        assert(end - start >= 90);
        assert(receivedHeaders - start < 100);
        assert(end - receivedHeaders >= 90);
      });

      it('allows setting a body delay by function', async function () {
        this.timeout(10000);
        const start = new Date();

        this.dep.mock({
          res: {
            ...resp.text('bloop'),
            bodyDelay: (req) => parseInt(req.headers['x-delay'], 10),
          },
        });

        await req({ port: this.dep.port, headers: { 'x-delay': '50' } });

        const end = new Date();
        assert(end - start >= 45);
      });
    });

    describe('destroySocket', function () {
      it('hangs up a socket', async function () {
        this.dep.mock({
          res: { ...resp.text('bloop'), destroySocket: true },
        });

        await assert.rejects(() => req({ port: this.dep.port }), {
          name: 'Error',
          code: 'ECONNRESET',
          message: 'socket hang up',
        });
      });
    });
  });

  describe('fun examples', function () {
    it('can mock an AWS backend', async function () {
      const maxNumberOfMessages = '5';
      const waitTimeSeconds = '2';

      this.dep.mock({
        req: {
          method: 'POST',
          pathname: '/',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': '120',
            'x-amz-user-agent': 'aws-sdk-js/3.204.0',
            authorization: (a) =>
              a.startsWith('AWS4-HMAC-SHA256 Credential=bloop'),
          },
          body: match.form({
            QueueUrl: `http://localhost:${this.dep.port}`,
            Action: 'ReceiveMessage',
            MaxNumberOfMessages: maxNumberOfMessages,
            WaitTimeSeconds: waitTimeSeconds,
            Version: '2012-11-05',
          }),
        },
        res: resp.text(sqsResponse(['bloop', 'bleep'])),
      });

      const sqs = new SQSClient({
        region: 'us-west-2',
        endpoint: `http://localhost:${this.dep.port}`,
        credentials: { accessKeyId: 'bloop', secretAccessKey: 'bloop' },
      });

      const res = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: `http://localhost:${this.dep.port}`,
          MaxNumberOfMessages: maxNumberOfMessages,
          WaitTimeSeconds: waitTimeSeconds,
        })
      );

      assert.deepStrictEqual(
        res.Messages.map((r) => r.Body),
        ['bloop', 'bleep']
      );
    });
  });
});
