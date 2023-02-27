import assert from 'node:assert';
import { Buffer } from 'node:buffer';

import {
  error,
  isString,
  isBuffer,
  isBoolean,
  isRegExp,
  isFunction,
  isUndefined,
  isInteger,
  isArray,
  isPlainObject,
  obj,
  arr,
  keyvals,
  or,
  and,
  alias,
  always,
  branch,
  branchWithFunction,
  exclusive,
  conform,
} from '../src/validate.js';

const isHex = (value, path = []) => {
  return /^[a-f0-9]+$/.test(value)
    ? [value.toUpperCase(), []]
    : [value, error(path, 'must be hex', value)];
};

const isShort = (value, path = []) => [
  value,
  value.length <= 4 ? [] : error(path, 'must be short', value),
];

const isUnary = (value, path = []) => [
  value,
  value.length === 1 ? [] : error(path, 'must be unary', value),
];

describe('validate', function () {
  describe('isString', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isString('bloop', ['value']), ['bloop', []]);
      assert.deepStrictEqual(isString(/bloop/, ['value']), [
        /bloop/,
        ['`value` must be string (got /bloop/)'],
      ]);
    });
  });

  describe('isBuffer', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(
        isBuffer(Buffer.from('bloop', 'utf8'), ['value']),
        [Buffer.from('bloop', 'utf8'), []]
      );

      assert.deepStrictEqual(isBuffer('bloop', ['value']), [
        'bloop',
        ["`value` must be buffer (got 'bloop')"],
      ]);
    });
  });

  describe('isBoolean', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isBoolean(true, ['value']), [true, []]);

      assert.deepStrictEqual(isBoolean('bloop', ['value']), [
        'bloop',
        ["`value` must be boolean (got 'bloop')"],
      ]);
    });
  });

  describe('isRegExp', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isRegExp(/bloop/, ['value']), [/bloop/, []]);
      assert.deepStrictEqual(isRegExp('bloop', ['value']), [
        'bloop',
        ["`value` must be regular expression (got 'bloop')"],
      ]);
    });
  });

  describe('isUndefined', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isUndefined(undefined, ['value']), [
        undefined,
        [],
      ]);
      assert.deepStrictEqual(isUndefined('bloop', ['value']), [
        'bloop',
        ["`value` must be undefined (got 'bloop')"],
      ]);
    });
  });

  describe('isInteger', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isInteger(1989, ['value']), [1989, []]);
      assert.deepStrictEqual(isInteger('bloop', ['value']), [
        'bloop',
        ["`value` must be integer (got 'bloop')"],
      ]);
    });
  });

  describe('isArray', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isArray([1989], ['value']), [[1989], []]);
      assert.deepStrictEqual(isArray('bloop', ['value']), [
        'bloop',
        ["`value` must be array (got 'bloop')"],
      ]);
    });
  });

  describe('isPlainObject', function () {
    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(isPlainObject({}, ['value']), [{}, []]);
      assert.deepStrictEqual(isPlainObject('bloop', ['value']), [
        'bloop',
        ["`value` must be plain object (got 'bloop')"],
      ]);
    });
  });

  describe('isFunction', function () {
    it('expects an optional predicate', function () {
      assert.throws(() => isFunction('bloop'), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert(typeof isFunction() === 'function');
      assert(typeof isFunction(isBoolean) === 'function');
    });

    it('returns errors when not satisfied', function () {
      assert.deepStrictEqual(
        isFunction(isBoolean)(() => true, ['value'])[1],
        []
      );

      assert.deepStrictEqual(isFunction(isBoolean)('bloop', ['value']), [
        'bloop',
        ["`value` must be function (got 'bloop')"],
      ]);
    });

    it('late binds validation when a predicate is passed', function () {
      const [f, errors] = isFunction(isBoolean)(
        (whatToReturn) => (whatToReturn === 'boolean' ? true : 'bloop'),
        ['value']
      );

      assert.deepStrictEqual(errors, []);

      assert.deepStrictEqual(f('boolean'), true);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `value()` must be boolean (got 'bloop')";

      assert.throws(() => f('string'), { name: 'ValidationError', message });
    });

    it('late binds validation when a predicate is passed (no prior path)', function () {
      const [f, errors] = isFunction(isBoolean)(
        (whatToReturn) => (whatToReturn === 'boolean' ? true : 'bloop'),
        []
      );

      assert.deepStrictEqual(errors, []);

      assert.deepStrictEqual(f('boolean'), true);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `()` must be boolean (got 'bloop')";

      assert.throws(() => f('string'), { name: 'ValidationError', message });
    });

    it('late binds validation when a predicate is passed (deep prior path)', function () {
      const [f, errors] = isFunction(isBoolean)(
        (whatToReturn) => (whatToReturn === 'boolean' ? true : 'bloop'),
        ['object', 'res', 'bloop']
      );

      assert.deepStrictEqual(errors, []);

      assert.deepStrictEqual(f('boolean'), true);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `object.res.bloop()` must be boolean (got 'bloop')";

      assert.throws(() => f('string'), { name: 'ValidationError', message });
    });

    it('late binds validation when a predicate is passed (nested functions)', function () {
      const schema = obj({ a: isFunction(obj({ b: isFunction(isBoolean) })) });

      const value = {
        a: (arg) => {
          if (arg === 'object') {
            return { b: (arg2) => (arg2 === 'boolean' ? true : 'bloop') };
          }

          return 'oof';
        },
      };

      const [conformed, errors] = schema(value, ['options']);

      assert.deepStrictEqual(errors, []);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `options.a()` must be plain object (got 'oof')";

      assert.throws(() => conformed.a('oops'), {
        name: 'ValidationError',
        message,
      });

      const message2 =
        'Validation failed. Resolve the following issues:\n' +
        "  * `options.a().b()` must be boolean (got 'bloop')";

      assert.throws(() => conformed.a('object').b('oops'), {
        name: 'ValidationError',
        message: message2,
      });

      assert.deepStrictEqual(conformed.a('object').b('boolean'), true);
    });

    it('does no late binding with no predicate', function () {
      const [f, errors] = isFunction()(
        (whatToReturn) => (whatToReturn === 'boolean' ? true : 'bloop'),
        ['value']
      );

      assert.deepStrictEqual(errors, []);

      assert.deepStrictEqual(f('boolean'), true);
      assert.deepStrictEqual(f('string'), 'bloop');
    });
  });

  describe('obj', function () {
    it('expects a valid schema', function () {
      assert.throws(() => obj('bloop'), {
        message: 'schema must be plain object',
        name: 'AssertionError',
      });
    });

    it('reports all errors in an object', function () {
      const schema = obj({
        string: isString,
        buffer: isBuffer,
        regexp: isRegExp,
        function: isFunction(),
        undefined: isUndefined,
        object: isPlainObject,
      });

      const invalidValue = {
        string: 1,
        buffer: 'bloop',
        regexp: true,
        function: Buffer.from('16', 'hex'),
        undefined: null,
        object: /bloop/,
      };

      assert.deepStrictEqual(schema(invalidValue), [
        {
          string: 1,
          buffer: 'bloop',
          regexp: true,
          function: Buffer.from('16', 'hex'),
          undefined: null,
          object: /bloop/,
        },
        [
          '`string` must be string (got 1)',
          "`buffer` must be buffer (got 'bloop')",
          '`regexp` must be regular expression (got true)',
          '`function` must be function (got <Buffer 16>)',
          '`undefined` must be undefined (got null)',
          '`object` must be plain object (got /bloop/)',
        ],
      ]);

      const f = () => '16';
      const validValue = {
        string: '1',
        buffer: Buffer.from('bloop', 'utf8'),
        regexp: /true/,
        function: f,
        undefined: undefined,
        object: { valid: true },
      };

      assert.deepStrictEqual(schema(validValue), [
        {
          string: '1',
          buffer: Buffer.from('bloop', 'utf8'),
          regexp: /true/,
          function: f,
          object: { valid: true },
        },
        [],
      ]);
    });

    it('expects an object', function () {
      const schema = obj({ string: isString });
      assert.deepStrictEqual(schema('bloop', ['value']), [
        'bloop',
        ["`value` must be plain object (got 'bloop')"],
      ]);
    });

    it('supports a prior path', function () {
      const schema = obj({ string: isString });

      assert.deepStrictEqual(schema({ string: 1 }, ['obj', 'req']), [
        { string: 1 },
        ['`obj.req.string` must be string (got 1)'],
      ]);
    });

    it('supports nested objs', function () {
      const schema = obj({
        a: obj({ b: obj({ c: isString }) }),
        b: isString,
      });

      assert.deepStrictEqual(schema({}), [
        {},
        [
          '`a` must be plain object (got undefined)',
          '`b` must be string (got undefined)',
        ],
      ]);

      assert.deepStrictEqual(schema({ a: {} }), [
        { a: {} },
        [
          '`a.b` must be plain object (got undefined)',
          '`b` must be string (got undefined)',
        ],
      ]);

      assert.deepStrictEqual(schema({ a: { b: {} } }), [
        { a: { b: {} } },
        [
          '`a.b.c` must be string (got undefined)',
          '`b` must be string (got undefined)',
        ],
      ]);

      assert.deepStrictEqual(schema({ a: { b: { c: 'bloop' } } }), [
        { a: { b: { c: 'bloop' } } },
        ['`b` must be string (got undefined)'],
      ]);

      assert.deepStrictEqual(schema({ a: { b: { c: 'bloop' } }, b: 'bleep' }), [
        { a: { b: { c: 'bloop' } }, b: 'bleep' },
        [],
      ]);
    });

    it('conforms values', function () {
      const schema = obj({
        a: obj({ b: obj({ c: isHex }) }),
        b: isHex,
      });

      assert.deepStrictEqual(
        schema({ a: { b: { c: 'f00d' } }, bonkersKey: 'wha??', b: 'cafe' }),
        [{ a: { b: { c: 'F00D' } }, b: 'CAFE' }, []]
      );
    });
  });

  describe('arr', function () {
    it('expects a valid schema', function () {
      assert.throws(() => arr('bloop'), {
        message: 'must pass a predicate',
        name: 'AssertionError',
      });
    });

    it('expects an array', function () {
      assert.deepStrictEqual(arr(isString)('bloop', ['value']), [
        'bloop',
        ["`value` must be array (got 'bloop')"],
      ]);
    });

    it('returns errors for failing values', function () {
      const f = () => 'oops';

      assert.deepStrictEqual(
        arr(isString)([/bloop/, 'bleep', 1989, f], ['value']),
        [
          [/bloop/, 'bleep', 1989, f],
          [
            '`value.0` must be string (got /bloop/)',
            '`value.2` must be string (got 1989)',
            '`value.3` must be string (got [Function: f])',
          ],
        ]
      );
    });

    it('conforms values', function () {
      const schema = arr(isHex);
      assert.deepStrictEqual(schema(['f00d', 'cafe']), [['F00D', 'CAFE'], []]);
    });
  });

  describe('keyvals', function () {
    it('must be passed valid predicates', function () {
      assert.throws(() => keyvals('bloop', null), {
        name: 'AssertionError',
        message: 'must pass a predicate',
      });

      assert.throws(() => keyvals(() => true, null), {
        name: 'AssertionError',
        message: 'must pass a predicate',
      });

      assert.throws(() => keyvals(null, () => true), {
        name: 'AssertionError',
        message: 'must pass a predicate',
      });
    });

    it('expects an object', function () {
      assert.deepStrictEqual(
        keyvals(
          () => true,
          () => true
        )('bloop', ['value']),
        ['bloop', ["`value` must be plain object (got 'bloop')"]]
      );
    });

    it('returns errors for failing keys and values', function () {
      // keys must be hex encoded, values must be strings
      const schema = keyvals(isHex, isString);

      assert.deepStrictEqual(schema({}, ['value']), [{}, []]);

      const f = () => 'oof';
      assert.deepStrictEqual(
        schema(
          {
            bloop: true,
            blorp: f,
          },
          ['value']
        ),
        [
          {
            bloop: true,
            blorp: f,
          },
          [
            "`value.$key` must be hex (got 'bloop')",
            '`value.bloop` must be string (got true)',
            "`value.$key` must be hex (got 'blorp')",
            '`value.blorp` must be string (got [Function: f])',
          ],
        ]
      );

      assert.deepStrictEqual(
        schema(
          {
            cafe: true,
            f00d: f,
          },
          ['value']
        ),
        [
          {
            CAFE: true,
            F00D: f,
          },
          [
            '`value.cafe` must be string (got true)',
            '`value.f00d` must be string (got [Function: f])',
          ],
        ]
      );

      assert.deepStrictEqual(
        schema(
          {
            cafe: 'true',
            f00d: 'oof',
          },
          ['value']
        ),
        [
          {
            CAFE: 'true',
            F00D: 'oof',
          },
          [],
        ]
      );
    });

    it('conforms values', function () {
      const schema = keyvals(isHex, isHex);
      assert.deepStrictEqual(
        schema({
          cafe: 'abcd',
          f00d: 'aabb',
        }),
        [
          {
            CAFE: 'ABCD',
            F00D: 'AABB',
          },
          [],
        ]
      );
    });
  });

  describe('or', function () {
    it('expects predicates', function () {
      assert.throws(() => or('bloop'), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(() => or(() => true, 'bloop'), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(() => or(), {
        name: 'AssertionError',
        message: 'must pass at least one predicate',
      });
    });

    it('returns errors only if no predicates are satisfied (short-circuits)', function () {
      const schema = or(isString, isBuffer);

      assert.deepStrictEqual(schema('bloop', ['value']), ['bloop', []]);

      assert.deepStrictEqual(schema(Buffer.from('bloop', 'utf8'), ['value']), [
        Buffer.from('bloop', 'utf8'),
        [],
      ]);

      assert.deepStrictEqual(schema(/bloop/, ['value']), [
        /bloop/,
        ['`value` must satisfy one of {isString, isBuffer} (got /bloop/)'],
      ]);
    });

    it('conforms values', function () {
      const schema = or(isFunction(), isHex);

      assert.deepStrictEqual(schema('cafe'), ['CAFE', []]);

      const f = () => 'bloop';
      assert.deepStrictEqual(schema(f), [f, []]);
    });
  });

  describe('and', function () {
    it('expects predicates', function () {
      assert.throws(() => and('bloop'), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(() => and(() => true, 'bloop'), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(() => and(), {
        name: 'AssertionError',
        message: 'must pass at least one predicate',
      });
    });

    it('returns errors if any predicates are not satisfied (short-circuits)', function () {
      const schema = and(isString, isHex, isShort);

      assert.deepStrictEqual(schema(/bloop/, ['value']), [
        /bloop/,
        ['`value` must be string (got /bloop/)'],
      ]);

      assert.deepStrictEqual(schema('bloop', ['value']), [
        'bloop',
        ["`value` must be hex (got 'bloop')"],
      ]);

      assert.deepStrictEqual(schema('f00dcafe', ['value']), [
        'f00dcafe',
        ["`value` must be short (got 'F00DCAFE')"],
      ]);

      assert.deepStrictEqual(schema('f00d', ['value']), ['F00D', []]);
    });

    it('conforms values', function () {
      const schema = and(isString, isHex, isShort);

      assert.deepStrictEqual(schema('cafe', ['value']), ['CAFE', []]);
      assert.deepStrictEqual(schema('f00dcafe', ['value']), [
        'f00dcafe',
        ["`value` must be short (got 'F00DCAFE')"],
      ]);
    });
  });

  describe('alias', function () {
    it('expects a predicate and message', function () {
      assert.throws(() => alias(), {
        name: 'AssertionError',
        message: 'must pass a predicate',
      });

      assert.throws(() => alias('bloop'), {
        name: 'AssertionError',
        message: 'must pass a predicate',
      });

      assert.throws(() => alias(() => 'bloop'), {
        name: 'AssertionError',
        message: 'must pass string alias',
      });
    });

    it('aliases a predicates error message', function () {
      const schema = or(isString, isBuffer);
      const aliasedSchema = alias(schema, 'must be string or buffer');

      assert.deepStrictEqual(schema('bloop', ['value']), ['bloop', []]);
      assert.deepStrictEqual(aliasedSchema('bloop', ['value']), ['bloop', []]);

      const b = Buffer.from('bloop', 'utf8');
      assert.deepStrictEqual(schema(b, ['value']), [b, []]);
      assert.deepStrictEqual(aliasedSchema(b, ['value']), [b, []]);

      assert.deepStrictEqual(schema(/bloop/, ['value']), [
        /bloop/,
        ['`value` must satisfy one of {isString, isBuffer} (got /bloop/)'],
      ]);

      assert.deepStrictEqual(aliasedSchema(/bloop/, ['value']), [
        /bloop/,
        ['`value` must be string or buffer (got /bloop/)'],
      ]);
    });

    it('conforms values', function () {
      const schema = alias(and(isString, isHex), 'must be hex string');
      assert.deepStrictEqual(schema('cafe'), ['CAFE', []]);
    });
  });

  describe('branch', function () {
    it('expects branch predicates, next predicates, and a branch message', function () {
      assert.throws(() => branch(), {
        name: 'AssertionError',
        message: 'must pass at least one predicate',
      });

      assert.throws(() => branch(['bloop'], ['bleep']), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(() => branch([() => true, () => true], [() => true]), {
        name: 'AssertionError',
        message: 'each branch must have a next predicate',
      });

      assert.throws(() => branch([() => true], [() => true]), {
        name: 'AssertionError',
        message: 'must pass string branch message',
      });
    });

    it('returns the branch message when no top-level branch is satisfied', function () {
      const schema = branch(
        [isString, isFunction()],
        [isHex, isUnary],
        'must be string or function'
      );

      assert.deepStrictEqual(schema(/bloop/, ['value']), [
        /bloop/,
        ['`value` must be string or function (got /bloop/)'],
      ]);
    });

    it('returns next predicate errors when a branch matches', function () {
      const schema = branch(
        [isString, isFunction(), isBuffer],
        [isHex, isUnary, always],
        'must be string or function'
      );

      assert.deepStrictEqual(schema('bloop', ['value']), [
        'bloop',
        ["`value` must be hex (got 'bloop')"],
      ]);

      assert.deepStrictEqual(schema('cafe', ['value']), ['CAFE', []]);

      const f = (a, b) => a + b;
      assert.deepStrictEqual(schema(f, ['value']), [
        f,
        ['`value` must be unary (got [Function: f])'],
      ]);

      const g = (a) => `bloop: ${a}`;
      assert.deepStrictEqual(schema(g, ['value']), [g, []]);

      assert.deepStrictEqual(schema(Buffer.from('bloop', 'utf8'), ['value']), [
        Buffer.from('bloop', 'utf8'),
        [],
      ]);
    });

    it('conforms values', function () {
      const schema = branch(
        [isString, isFunction(isBoolean), isBuffer],
        [isHex, always, always],
        'must be string or function'
      );

      assert.deepStrictEqual(schema('cafe', ['value']), ['CAFE', []]);
      assert.deepStrictEqual(schema(Buffer.from('bloop', 'utf8'), ['value']), [
        Buffer.from('bloop', 'utf8'),
        [],
      ]);

      const [g, errors] = schema(() => 'bloop', ['value']);
      assert.deepStrictEqual(errors, []);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `value()` must be boolean (got 'bloop')";

      assert.throws(g, { name: 'ValidationError', message });
    });
  });

  describe('branchWithFunction', function () {
    it('expects branch predicates, next predicates, and a branch message', function () {
      assert.throws(() => branchWithFunction(), {
        name: 'AssertionError',
        message: 'must pass at least one predicate',
      });

      assert.throws(() => branchWithFunction(['bloop'], ['bleep']), {
        name: 'AssertionError',
        message: 'predicates must be functions',
      });

      assert.throws(
        () => branchWithFunction([() => true, () => true], [() => true]),
        {
          name: 'AssertionError',
          message: 'each branch must have a next predicate',
        }
      );

      assert.throws(() => branchWithFunction([() => true], [() => true]), {
        name: 'AssertionError',
        message: 'must pass string branch message',
      });
    });

    it('returns the branch message when no top-level branch is satisfied', function () {
      const schema = branchWithFunction(
        [isString, isUndefined],
        [isHex, always],
        'if defined must be string'
      );

      assert.deepStrictEqual(schema(/bloop/, ['value']), [
        /bloop/,
        [
          '`value` if defined must be string or function returning same (got /bloop/)',
        ],
      ]);
    });

    it('returns next predicate errors when a branch matches', function () {
      const schema = branchWithFunction(
        [isString, isUndefined],
        [isHex, always],
        'if defined must be string'
      );

      assert.deepStrictEqual(schema('bloop', ['value']), [
        'bloop',
        ["`value` must be hex (got 'bloop')"],
      ]);
    });

    it('allows a function returning same', function () {
      const schema = branchWithFunction(
        [isString, isUndefined],
        [isHex, always],
        'if defined must be string'
      );

      let [f, errors] = schema(() => 'cafe', ['value']);
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(f(), 'CAFE');

      [f, errors] = schema(() => 'oops', ['value']);
      assert.deepStrictEqual(errors, []);

      const message =
        'Validation failed. Resolve the following issues:\n' +
        "  * `value()` must be hex (got 'oops')";

      assert.throws(f, { name: 'ValidationError', message });
    });
  });

  describe('exclusive', function () {
    it('expects valid groups', function () {
      assert.throws(() => exclusive(), {
        name: 'AssertionError',
        message: 'groups must be arrays',
      });

      assert.throws(() => exclusive([], []), {
        name: 'AssertionError',
        message: 'groups must have at least 1 element',
      });

      assert.throws(() => exclusive(['bloop'], [/bloop/]), {
        name: 'AssertionError',
        message: 'group elements must be strings',
      });
    });

    it('expects an object', function () {
      const schema = exclusive(['bloop'], ['bleep']);
      assert.deepStrictEqual(schema(/oof/, ['value']), [
        /oof/,
        ['`value` must be plain object (got /oof/)'],
      ]);
    });

    it('expects mutually exclusive keys', function () {
      assert.deepStrictEqual(exclusive(['bloop'], ['bleep'])({}, ['value']), [
        {},
        [],
      ]);

      assert.deepStrictEqual(
        exclusive(['bloop'], ['bleep'])({ a: 1 }, ['value']),
        [{ a: 1 }, []]
      );

      assert.deepStrictEqual(
        exclusive(['bloop'], ['bleep'])({ bloop: 1 }, ['value']),
        [{ bloop: 1 }, []]
      );

      assert.deepStrictEqual(
        exclusive(['bloop'], ['bleep'])({ bleep: 1 }, ['value']),
        [{ bleep: 1 }, []]
      );

      assert.deepStrictEqual(
        exclusive(['bloop'], ['bleep'])({ bloop: 1, bleep: 1 }, ['value']),
        [
          { bloop: 1, bleep: 1 },
          [
            '`value` bloop cannot be defined at the same time as bleep (got { bloop: 1, bleep: 1 })',
          ],
        ]
      );

      assert.deepStrictEqual(
        exclusive(['one', 'two'], ['three', 'four'])({ one: 1, three: 1 }, [
          'value',
        ]),
        [
          { one: 1, three: 1 },
          [
            '`value` one cannot be defined at the same time as three (got { one: 1, three: 1 })',
          ],
        ]
      );

      assert.deepStrictEqual(
        exclusive(['one', 'two'], ['three', 'four'])(
          { one: 1, three: 1, four: 1 },
          ['value']
        ),
        [
          { one: 1, three: 1, four: 1 },
          [
            '`value` one cannot be defined at the same time as three or four (got { one: 1, three: 1, four: 1 })',
          ],
        ]
      );

      assert.deepStrictEqual(
        exclusive(['one', 'two'], ['three', 'four'])(
          { one: 1, two: 1, three: 1, four: 1 },
          ['value']
        ),
        [
          { one: 1, two: 1, three: 1, four: 1 },
          [
            '`value` one or two cannot be defined at the same time as three or four (got { one: 1, two: 1, three: 1, four: 1 })',
          ],
        ]
      );

      assert.deepStrictEqual(
        exclusive(['one', 'two'], ['three', 'four', 'five'])(
          { one: 1, two: 1, three: 1, four: 1, five: 1 },
          ['value']
        ),
        [
          { one: 1, two: 1, three: 1, four: 1, five: 1 },
          [
            '`value` one or two cannot be defined at the same time as three, four, or five (got { one: 1, two: 1, three: 1, four: 1, five: 1 })',
          ],
        ]
      );
    });
  });

  describe('conform', function () {
    it('returns a conformed value when no errors', function () {
      const schema = obj({
        string: and(isString, isHex),
        object: obj({ buffer: isBuffer }),
      });

      const value = {
        string: 'cafe',
        object: { buffer: Buffer.from('bloop', 'utf8') },
      };

      assert.deepStrictEqual(conform(schema(value, ['value'])), {
        string: 'CAFE',
        object: { buffer: Buffer.from('bloop', 'utf8') },
      });
    });

    it('throws an error for an invalid value', function () {
      const schema = obj({
        string: and(isString, isHex),
        object: obj({ buffer: isBuffer }),
      });

      const value = {
        string: 1,
        object: { buffer: 'bloop' },
      };

      const message =
        'Validation failed. Resolve the following issues:\n' +
        '  * `value.string` must be string (got 1)\n' +
        "  * `value.object.buffer` must be buffer (got 'bloop')";

      assert.throws(() => conform(schema(value, ['value'])), {
        name: 'ValidationError',
        message,
      });
    });
  });
});
