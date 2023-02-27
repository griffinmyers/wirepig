import assert from 'node:assert';
import { Buffer } from 'node:buffer';

import { helpers } from '../src/index.js';
const { match, res } = helpers;

describe('helpers', function () {
  describe('match', function () {
    describe('json', function () {
      it('deeply matches JSON values', function () {
        assert(
          match.json({ a: 1, b: ['c', 2, {}] })(
            Buffer.from('{"a": 1, "b": ["c", 2, {}]}', 'utf8')
          )
        );

        assert(
          !match.json({ a: 1, b: ['c', 3, {}] })(
            Buffer.from('{"a": 1, "b": ["c", 2, {}]}', 'utf8')
          )
        );
      });
    });

    describe('form', function () {
      it('deeply matches form values', function () {
        assert(
          match.form({ a: '1', b: ['c bloop', '2'] })(
            Buffer.from('a=1&b=c%20bloop&b=2', 'utf8')
          )
        );

        assert(
          !match.form({ a: '1', b: ['c bloop', '2'] })(
            Buffer.from('a=1&b=2&b=c%20bloop', 'utf8')
          )
        );
      });
    });

    describe('query', function () {
      it('deeply matches query values', function () {
        assert(
          match.query({ a: '1', b: ['c bloop', '2'] })(
            Buffer.from('?a=1&b=c%20bloop&b=2', 'utf8')
          )
        );

        assert(
          !match.query({ a: '1', b: ['c bloop', '2'] })(
            Buffer.from('?a=1&b=2&b=c%20bloop', 'utf8')
          )
        );
      });
    });
  });

  describe('res', function () {
    describe('text', function () {
      it('produces a text response description', function () {
        assert.deepStrictEqual(res.text('bloop the big one'), {
          body: Buffer.from('bloop the big one', 'utf8'),
          headers: {
            'content-length': '17',
            'content-type': 'text/plain',
          },
          statusCode: 200,
        });

        assert.deepStrictEqual(
          res.text('bloop the big one', { statusCode: 404 }),
          {
            body: Buffer.from('bloop the big one', 'utf8'),
            headers: {
              'content-length': '17',
              'content-type': 'text/plain',
            },
            statusCode: 404,
          }
        );

        assert.deepStrictEqual(
          res.text('bloop the big one', {
            headers: { 'content-type': 'oof', 'x-bloop': 'true' },
          }),
          {
            body: Buffer.from('bloop the big one', 'utf8'),
            headers: {
              'content-length': '17',
              'content-type': 'oof',
              'x-bloop': 'true',
            },
            statusCode: 200,
          }
        );
      });
    });

    describe('json', function () {
      it('produces a json response description', function () {
        assert.deepStrictEqual(res.json({ bloop: 'the big one' }), {
          body: Buffer.from('{"bloop":"the big one"}', 'utf8'),
          headers: {
            'content-length': '23',
            'content-type': 'application/json',
          },
          statusCode: 200,
        });

        assert.deepStrictEqual(
          res.json({ bloop: 'the big one' }, { statusCode: 404 }),
          {
            body: Buffer.from('{"bloop":"the big one"}', 'utf8'),
            headers: {
              'content-length': '23',
              'content-type': 'application/json',
            },
            statusCode: 404,
          }
        );

        assert.deepStrictEqual(
          res.json(
            { bloop: 'the big one' },
            {
              headers: { 'content-type': 'oof', 'x-bloop': 'true' },
            }
          ),
          {
            body: Buffer.from('{"bloop":"the big one"}', 'utf8'),
            headers: {
              'content-length': '23',
              'content-type': 'oof',
              'x-bloop': 'true',
            },
            statusCode: 200,
          }
        );
      });
    });
  });
});
