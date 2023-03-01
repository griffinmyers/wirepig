import assert from 'node:assert';
import { inspect } from 'node:util';

import {
  isPlainObject as _isPlainObject,
  isArray as _isArray,
  isString as _isString,
  isFunction as _isFunction,
  isBuffer as _isBuffer,
  isBoolean as _isBoolean,
  isRegExp as _isRegExp,
  isInteger as _isInteger,
  isUndefined as _isUndefined,
} from './lib.js';

import { ValidationError } from './errors.js';

const arrayOr = (a) => {
  const formatter = new Intl.ListFormat('en', {
    style: 'long',
    type: 'disjunction',
  });
  return formatter.format(a);
};

const r = (value, errors) => [value, errors];

const assertPredicate = (predicate) =>
  assert(_isFunction(predicate), 'must pass a predicate');

const assertPredicates = (predicates) => {
  assert(
    Array.isArray(predicates) && predicates.length > 0,
    'must pass at least one predicate'
  );

  assert(predicates.every(_isFunction), 'predicates must be functions');
};

export const error = (path, message, value) => [
  `\`${path.join('.')}\` ${message} (got ${inspect(value)})`,
];

export const always = (value) => r(value, []);

export const isString = (value, path = []) => {
  return r(value, _isString(value) ? [] : error(path, 'must be string', value));
};

export const isPlainObject = (value, path = []) => {
  return r(
    value,
    _isPlainObject(value) ? [] : error(path, 'must be plain object', value)
  );
};

export const isBuffer = (value, path = []) => {
  return r(value, _isBuffer(value) ? [] : error(path, 'must be buffer', value));
};

export const isBoolean = (value, path = []) => {
  return r(
    value,
    _isBoolean(value) ? [] : error(path, 'must be boolean', value)
  );
};

export const isRegExp = (value, path = []) => {
  return r(
    value,
    _isRegExp(value) ? [] : error(path, 'must be regular expression', value)
  );
};

export const isUndefined = (value, path = []) => {
  return r(
    value,
    _isUndefined(value) ? [] : error(path, 'must be undefined', value)
  );
};

export const isInteger = (value, path = []) => {
  return r(
    value,
    _isInteger(value) ? [] : error(path, 'must be integer', value)
  );
};

export const isArray = (value, path = []) => {
  return r(value, _isArray(value) ? [] : error(path, 'must be array', value));
};

export const obj = (o) => {
  assert(_isPlainObject(o), 'schema must be plain object');
  assertPredicates(Object.values(o));

  return (value, path = []) => {
    if (!_isPlainObject(value)) {
      return r(value, error(path, 'must be plain object', value));
    }

    let errors = [];
    const conformed = {};

    for (const [k, v] of Object.entries(o)) {
      const [c, keyErrors] = v(value[k], [...path, k]);

      if (c !== undefined) {
        conformed[k] = c;
      }

      errors = [...errors, ...keyErrors];
    }

    return r(conformed, errors);
  };
};

export const arr = (valuePredicate) => {
  assertPredicate(valuePredicate);

  return (value, path = []) => {
    if (!_isArray(value)) {
      return r(value, error(path, 'must be array', value));
    }

    let errors = [];
    const conformed = [];

    for (const [i, v] of value.entries()) {
      const [c, elementErrors] = valuePredicate(v, [...path, i]);

      conformed.push(c);
      errors = [...errors, ...elementErrors];
    }

    return r(conformed, errors);
  };
};

export const keyvals = (keyPredicate, valuePredicate) => {
  assertPredicate(keyPredicate);
  assertPredicate(valuePredicate);

  return (value, path = []) => {
    if (!_isPlainObject(value)) {
      return r(value, error(path, 'must be plain object', value));
    }

    let errors = [];
    const conformed = {};

    for (const [k, v] of Object.entries(value)) {
      const [cK, keyErrors] = keyPredicate(k, [...path, '$key']);
      const [cV, valueErrors] = valuePredicate(v, [...path, k]);

      conformed[cK] = cV;
      errors = [...errors, ...keyErrors, ...valueErrors];
    }

    return r(conformed, errors);
  };
};

export const or = (...predicates) => {
  assertPredicates(predicates);

  return (value, path = []) => {
    for (const p of predicates) {
      const res = p(value, path);
      if (res[1].length === 0) {
        return res;
      }
    }

    return r(
      value,
      error(
        path,
        `must satisfy one of {${predicates.map((p) => p.name).join(', ')}}`,
        value
      )
    );
  };
};

export const and = (...predicates) => {
  assertPredicates(predicates);

  return (value, path = []) => {
    let conformed = value;

    for (const p of predicates) {
      const [c, errors] = p(conformed, path);
      conformed = c;

      if (errors.length !== 0) {
        return r(value, errors);
      }
    }

    return r(conformed, []);
  };
};

export const alias = (p, message) => {
  assertPredicate(p);
  assert(_isString(message), 'must pass string alias');

  return (value, path = []) => {
    const [conformed, errors] = p(value, path);
    return r(conformed, errors.length === 0 ? [] : error(path, message, value));
  };
};

export const branch = (branchPredicates, nextPredicates, branchMessage) => {
  assertPredicates(branchPredicates);
  assertPredicates(nextPredicates);
  assert(
    branchPredicates.length === nextPredicates.length,
    'each branch must have a next predicate'
  );
  assert(_isString(branchMessage), 'must pass string branch message');

  return (value, path = []) => {
    for (const i in branchPredicates) {
      const [conformed, branchErrors] = branchPredicates[i](value, path);
      if (branchErrors.length === 0) {
        return nextPredicates[i](conformed, path);
      }
    }

    return r(value, error(path, branchMessage, value));
  };
};

export const branchWithFunction = (
  branchPredicates,
  nextPredicates,
  branchMessage
) => {
  const valuePredicate = branch(
    branchPredicates,
    nextPredicates,
    branchMessage
  );

  return branch(
    [...branchPredicates, isFunction(valuePredicate)],
    [...nextPredicates, always],
    `${branchMessage} or function returning same`
  );
};

export const isFunction = (predicate) => {
  if (predicate !== undefined) {
    assertPredicates([predicate]);
  }

  return (value, path = []) => {
    if (!_isFunction(value)) {
      return r(value, error(path, 'must be function', value));
    }

    if (predicate === undefined) {
      return r(value, []);
    }

    const lateValidator = (...args) => {
      const funcPath = [...path.slice(0, -1), `${path.slice(-1)[0] ?? ''}()`];
      return conform(predicate(value(...args), funcPath));
    };

    lateValidator[inspect.custom] = () => `[Function: ${value.name}]`;

    return r(lateValidator, []);
  };
};

export const exclusive = (groupA, groupB) => {
  [groupA, groupB].forEach((group) => {
    assert(Array.isArray(group), 'groups must be arrays');
    assert(group.length > 0, 'groups must have at least 1 element');
    assert(group.every(_isString), 'group elements must be strings');
  });

  return (value, path = []) => {
    if (!_isPlainObject(value)) {
      return r(value, error(path, 'must be plain object', value));
    }

    const groupADefined = groupA.filter((e) => !_isUndefined(value[e]));
    const groupBDefined = groupB.filter((e) => !_isUndefined(value[e]));

    if (groupADefined.length > 0 && groupBDefined.length > 0) {
      const message = `${arrayOr(
        groupADefined
      )} cannot be defined at the same time as ${arrayOr(groupBDefined)}`;

      return r(value, error(path, message, value));
    }

    return r(value, []);
  };
};

export const conform = ([conformed, errors]) => {
  if (errors.length === 0) {
    return conformed;
  }

  throw new ValidationError(
    `Validation failed. Resolve the following issues:\n${errors
      .map((r) => `  * ${r}`)
      .join('\n')}`
  );
};
