import assert from 'node:assert';
import { Buffer } from 'node:buffer';

import {
  isPlainObject,
  compare,
  toHTTPRes,
  toTCPRes,
  mapObj,
  wait,
} from '../src/lib.js';

describe('lib', function () {
  describe('#isPlainObject', function () {
    const positiveExamples = [
      ['empty object', {}],
      ['object with keys', { a: 1 }],
      ['object from new Object()', new Object()],
    ];

    for (const [name, value] of positiveExamples) {
      it(`returns true for ${name}`, function () {
        assert(isPlainObject(value));
      });
    }

    const negativeExamples = [
      ['null', null],
      ['undefined', undefined],
      ['number', 1.23],
      ['string', 'bloop'],
      ['array', []],
      ['map', new Map()],
      ['date', new Date()],
      ['custom class instance', new (class Bloop {})()],
    ];

    for (const [name, value] of negativeExamples) {
      it(`returns false for ${name}`, function () {
        assert(!isPlainObject(value));
      });
    }
  });

  describe('#compare', function () {
    it('returns true for undefined values', function () {
      assert(compare(undefined, 'anything'));
    });

    it('compares strings case sensitive', function () {
      assert(compare('', ''));
      assert(compare('a', 'a'));
      assert(!compare('a', 'A'));
      assert(!compare('A', 'a'));
      assert(compare('A', 'A'));
      assert(!compare('bLoOp', 'BlOoP'));
      assert(compare('BlOoP', 'BlOoP'));
    });

    it('compares buffers', function () {
      assert(
        compare(
          Buffer.from('feedcafe', 'hex'),
          Buffer.from([254, 237, 202, 254])
        )
      );

      assert(
        !compare(
          Buffer.from('feedcafe', 'hex'),
          Buffer.from([255, 237, 202, 254])
        )
      );
    });

    it('compares buffers and strings', function () {
      assert(compare(Buffer.from('bloop', 'utf8'), 'bloop'));
      assert(!compare(Buffer.from('BLOOP', 'utf8'), 'bloop'));
      assert(!compare(Buffer.from('bloop', 'utf8'), 'BLOOP'));
      assert(!compare(Buffer.from('bloop', 'utf8'), 'blorp'));
    });

    it('compares strings and buffers', function () {
      assert(compare('bloop', Buffer.from('bloop', 'utf8')));
      assert(!compare('bloop', Buffer.from('BLOOP', 'utf8')));
      assert(!compare('BLOOP', Buffer.from('bloop', 'utf8')));
      assert(!compare('blorp', Buffer.from('bloop', 'utf8')));
    });

    it(`compares regexes and strings`, function () {
      assert(compare(/^bl.*p$/, 'bloop'));
      assert(compare(/^bl.*p$/, 'blorp'));
      assert(compare(/^bl(.*)p$/, 'blorp'));
      assert(!compare(/^bl(.*)p$/, 'blorpz'));
    });

    it(`compares regexes and buffers`, function () {
      assert(compare(/^bl.*p$/, Buffer.from('bloop', 'utf8')));
      assert(compare(/^bl.*p$/, Buffer.from('blorp', 'utf8')));
      assert(compare(/^bl(.*)p$/, Buffer.from('blorp', 'utf8')));
      assert(!compare(/^bl(.*)p$/, Buffer.from('blorz', 'utf8')));
    });

    it('compares with a predicate', function () {
      let arg = null;

      assert(
        compare((v) => {
          arg = v;
          return true;
        }, 'bloop')
      );

      assert.deepStrictEqual(arg, 'bloop');

      assert(
        !compare((v) => {
          arg = v;
          return false;
        }, 'bleep')
      );

      assert.deepStrictEqual(arg, 'bleep');

      assert(
        !compare((v) => {
          arg = v;
          throw new Error('oops');
        }, 'blorp')
      );

      assert.deepStrictEqual(arg, 'blorp');
    });

    it('compares arrays recursively', function () {
      assert(compare(['bLoOp'], ['bLoOp', 'blooooop']));
      assert(compare([undefined, 'blooooop'], ['bLoOp', 'blooooop']));

      assert(
        compare(
          ['bLoOp', /^bl.*p$/, (v) => v.endsWith('oop'), ['eeps']],
          ['bLoOp', 'blooooop', 'baloop', ['eeps']]
        )
      );

      assert(
        !compare(
          ['bLoOp', /^bl.*p$/, (v) => v.endsWith('oop'), ['eeps']],
          ['bLoOp', 'blooooop', 'baloop', ['eepz']]
        )
      );
    });

    it('compares objects recursively', function () {
      assert(
        compare(
          {
            string_value: 'bLoOp',
            regex_value: /^bl.*p$/,
            predicate_value: (v) => v.endsWith('oop'),
            object_value: {
              another_object_value: {
                another_predicate_value: (v) => v === 'blonk',
              },
            },
          },
          {
            undefined_value: 'anything',
            string_value: 'bLoOp',
            regex_value: 'bloop',
            predicate_value: 'bigbloop',
            object_value: {
              another_object_value: {
                another_predicate_value: 'blonk',
              },
            },
          }
        )
      );

      assert(
        !compare(
          {
            string_value: 'bLoOp',
            regex_value: /^bl.*p$/,
            predicate_value: (v) => v.endsWith('oop'),
            object_value: {
              another_object_value: {
                another_predicate_value: (v) => v === 'blonk',
              },
            },
          },
          {
            undefined_value: 'anything',
            string_value: 'bLoOp',
            regex_value: 'bloop',
            predicate_value: 'bigbloop',
            object_value: {
              another_object_value: {
                another_predicate_value: 'oof',
              },
            },
          }
        )
      );
    });
  });

  describe('#toHTTPRes', function () {
    const req = { a: 1 };
    const reqBody = Buffer.from('bloop', 'utf8');

    it('accepts a function', function () {
      assert.deepStrictEqual(
        toHTTPRes(() => ({}), req, reqBody),
        {
          body: Buffer.from([]),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(
          () => {
            throw new Error('oops');
          },
          req,
          reqBody
        ),
        {
          body: Buffer.from([]),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(() => ({ statusCode: 404 }), req, reqBody),
        {
          body: Buffer.from([]),
          headers: {},
          statusCode: 404,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes((r, rB) => ({ body: `req: ${rB}` }), req, reqBody),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(
          (r, rB) => ({ body: Buffer.from(`req: ${rB}`, 'utf8') }),
          req,
          reqBody
        ),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(() => ({ body: (r, rB) => `req: ${rB}` }), req, reqBody),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(() => new Date(), req, reqBody),
        {
          body: Buffer.from([]),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );
    });

    it('accepts an object', function () {
      assert.deepStrictEqual(toHTTPRes({ body: 'req: bloop' }, req, reqBody), {
        body: Buffer.from('req: bloop', 'utf8'),
        headers: {},
        statusCode: 200,
        bodyDelay: 0,
        headerDelay: 0,
        destroySocket: false,
      });

      assert.deepStrictEqual(
        toHTTPRes({ body: Buffer.from('req: bloop', 'utf8') }, req, reqBody),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes({ body: (r, rB) => `req: ${rB}` }, req, reqBody),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(
          {
            body: () => {
              throw new Error('oops');
            },
            headers: () => {
              throw new Error('oops');
            },
            statusCode: () => {
              throw new Error('oops');
            },
            bodyDelay: () => {
              throw new Error('oops');
            },
            headerDelay: () => {
              throw new Error('oops');
            },
            destroySocket: () => {
              throw new Error('oops');
            },
          },
          req,
          reqBody
        ),
        {
          body: Buffer.from([], 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(
          {
            body: () => /yikes/,
            headers: () => /oof/,
            statusCode: () => /bad-values/,
            bodyDelay: () => /really-bad-values/,
            headerDelay: () => -1,
            destroySocket: () => /sheesh/,
          },
          req,
          reqBody
        ),
        {
          body: Buffer.from([], 'utf8'),
          headers: {},
          statusCode: 200,
          bodyDelay: 0,
          headerDelay: -1,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toHTTPRes(
          {
            bodyDelay: (req) => req.a,
            headerDelay: 30,
            headers: {
              'x-bloop': () => {
                throw new Error('oops');
              },
              'x-bloop-2': () => 'bloop!',
              'x-string': 'string',
              'x-buffer': Buffer.from('buffer', 'utf8'),
            },
            destroySocket: () => true,
          },
          req,
          reqBody
        ),
        {
          body: Buffer.from([], 'utf8'),
          headers: {
            'x-bloop': Buffer.from([]),
            'x-bloop-2': Buffer.from('bloop!', 'utf8'),
            'x-string': Buffer.from('string', 'utf8'),
            'x-buffer': Buffer.from('buffer', 'utf8'),
          },
          statusCode: 200,
          bodyDelay: 1,
          headerDelay: 30,
          destroySocket: true,
        }
      );
    });
  });

  describe('toTCPRes', function () {
    const req = Buffer.from('bloop', 'utf8');

    it('accepts an object', function () {
      assert.deepStrictEqual(toTCPRes({}, req), {
        body: Buffer.from([]),
        bodyDelay: 0,
        destroySocket: false,
      });

      assert.deepStrictEqual(
        toTCPRes({ body: 'bloop', bodyDelay: 12, destroySocket: true }, req),
        {
          body: Buffer.from('bloop', 'utf8'),
          bodyDelay: 12,
          destroySocket: true,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(
          {
            body: (req) => `req: ${req}`,
            bodyDelay: () => 12,
            destroySocket: () => true,
          },
          req
        ),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          bodyDelay: 12,
          destroySocket: true,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(
          {
            body: () => {
              throw new Error('oops');
            },
            bodyDelay: () => {
              throw new Error('oops');
            },
            destroySocket: () => {
              throw new Error('oops');
            },
          },
          req
        ),
        {
          body: Buffer.from([]),
          bodyDelay: 0,
          destroySocket: false,
        }
      );
    });

    it('accepts a bufferable', function () {
      assert.deepStrictEqual(toTCPRes(undefined, req), {
        body: Buffer.from([]),
        bodyDelay: 0,
        destroySocket: false,
      });

      assert.deepStrictEqual(toTCPRes('bloop', req), {
        body: Buffer.from('bloop', 'utf8'),
        bodyDelay: 0,
        destroySocket: false,
      });

      assert.deepStrictEqual(toTCPRes(Buffer.from('bloop', 'utf8'), req), {
        body: Buffer.from('bloop', 'utf8'),
        bodyDelay: 0,
        destroySocket: false,
      });
    });

    it('accepts a function to bufferable', function () {
      assert.deepStrictEqual(
        toTCPRes(() => {
          throw new Error('oops');
        }, req),
        {
          body: Buffer.from([]),
          bodyDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(() => undefined, req),
        {
          body: Buffer.from([]),
          bodyDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toTCPRes((req) => `req: ${req}`, req),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          bodyDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(() => Buffer.from('bloop', 'utf8'), req),
        {
          body: Buffer.from('bloop', 'utf8'),
          bodyDelay: 0,
          destroySocket: false,
        }
      );
    });

    it('accepts a function to object', function () {
      assert.deepStrictEqual(
        toTCPRes(() => ({}), req),
        {
          body: Buffer.from([]),
          bodyDelay: 0,
          destroySocket: false,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(
          (req) => ({
            body: `req: ${req}`,
            bodyDelay: 12,
            destroySocket: true,
          }),
          req
        ),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          bodyDelay: 12,
          destroySocket: true,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(
          () => ({
            body: (req) => `req: ${req}`,
            bodyDelay: () => 12,
            destroySocket: () => true,
          }),
          req
        ),
        {
          body: Buffer.from('req: bloop', 'utf8'),
          bodyDelay: 12,
          destroySocket: true,
        }
      );

      assert.deepStrictEqual(
        toTCPRes(
          () => ({
            body: () => {
              throw new Error('oops');
            },
            bodyDelay: () => {
              throw new Error('oops');
            },
            destroySocket: () => {
              throw new Error('oops');
            },
          }),
          req
        ),
        {
          body: Buffer.from([]),
          bodyDelay: 0,
          destroySocket: false,
        }
      );
    });
  });

  describe('#mapObj', function () {
    it('maps keys and values of an object', function () {
      const value = { bloop: 1, bleep: 2 };

      assert.deepStrictEqual(
        mapObj(value, ([k, v]) => [k.toUpperCase(), v + 1]),
        { BLOOP: 2, BLEEP: 3 }
      );

      assert.deepStrictEqual(value, { bloop: 1, bleep: 2 });
    });
  });

  describe('#wait', function () {
    it('causes an async delay', async function () {
      const start = new Date();
      await wait(100);
      const end = new Date();

      assert(end - start >= 90);
    });
  });
});
