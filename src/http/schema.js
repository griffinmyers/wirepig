import {
  error,
  always,
  obj,
  arr,
  or,
  and,
  isString,
  isBuffer,
  isBoolean,
  isRegExp,
  isUndefined,
  isInteger,
  isArray,
  isPlainObject,
  isFunction,
  alias,
  branch,
  branchWithFunction,
  keyvals,
} from '../validate.js';

export const optComparable = alias(
  or(isString, isBuffer, isRegExp, isFunction(isBoolean), isUndefined),
  'if defined must be string, buffer, regular expression, or function'
);

const headerComparable = branch(
  [optComparable, isArray],
  [always, arr(optComparable)],
  'must be string, buffer, regular expresson, function, or array of same'
);

const reqHeaders = branch(
  [isPlainObject, isFunction(isBoolean), isUndefined],
  [keyvals(always, headerComparable), always, always],
  'if defined must be plain object or function'
);

export const optBufferable = alias(
  or(isString, isBuffer, isUndefined),
  'if defined must be string or buffer'
);

export const funcOptBufferable = alias(
  or(optBufferable, isFunction(optBufferable)),
  'if defined must be string, buffer, or function returning same'
);

const isValidResHeaders = keyvals(always, funcOptBufferable);

const resHeaders = branchWithFunction(
  [isPlainObject, isUndefined],
  [isValidResHeaders, always],
  'if defined must be plain object'
);

const isValidStatusCode = (value, path = []) => [
  value,
  value >= 100 && value <= 599
    ? []
    : error(path, 'must be valid status code', value),
];

const statusCode = branchWithFunction(
  [and(isInteger, isValidStatusCode), isUndefined],
  [always, always],
  'if defined must be valid HTTP status code'
);

const isPositive = (value, path = []) => [
  value,
  value >= 0 ? [] : error(path, 'must be postive', value),
];

export const isPositiveInt = and(isInteger, isPositive);

export const delay = branchWithFunction(
  [isPositiveInt, isUndefined],
  [always, always],
  'if defined must be positive integer'
);

export const destroySocket = branchWithFunction(
  [isBoolean, isUndefined],
  [always, always],
  'if defined must be boolean'
);

const reqObj = obj({
  method: optComparable,
  pathname: optComparable,
  query: optComparable,
  headers: reqHeaders,
  body: optComparable,
});

const req = branch(
  [isPlainObject, isFunction(isBoolean), isUndefined],
  [reqObj, always, always],
  'if defined must be plain object or function'
);

const resObj = obj({
  body: funcOptBufferable,
  headers: resHeaders,
  statusCode: statusCode,
  headerDelay: delay,
  bodyDelay: delay,
  destroySocket,
});

const res = branchWithFunction(
  [isPlainObject, isUndefined],
  [resObj, always],
  'if defined must be plain object'
);

export const mockSchema = branch(
  [isPlainObject, isUndefined],
  [obj({ req, res }), always],
  'if defined must be plain object'
);

export const port = alias(
  or(isPositiveInt, isUndefined),
  'if defined must be positive integer'
);

export const httpSchema = branch(
  [isPlainObject, isUndefined],
  [obj({ port }), always],
  'if defined must be plain object'
);
