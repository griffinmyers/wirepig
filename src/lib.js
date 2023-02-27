import { Buffer } from 'node:buffer';
import { inspect, debuglog } from 'node:util';

export const isFunction = (v) => typeof v === 'function';
export const isString = (v) => typeof v === 'string';
export const isBuffer = (v) => Buffer.isBuffer(v);
export const isBoolean = (v) => typeof v === 'boolean';
export const isPlainObject = (v) =>
  v !== null && v !== undefined && v.constructor === Object;
export const isArray = (v) => Array.isArray(v);
export const isInteger = (v) => Number.isInteger(v);
export const isRegExp = (v) => v instanceof RegExp;
export const isUndefined = (v) => v === undefined;

export const D = debuglog('wirepig');
export const DM = debuglog('wirepig.match');

const valueToString = (v, opts) =>
  inspect(v, { depth: 3, breakLength: Infinity, ...opts });

const safeInvoke = (f, defaultValue, ...args) => {
  if (!isFunction(f)) {
    return f;
  }

  try {
    return f(...args);
  } catch (e) {
    D('Unexpected exception thrown by %O:\n%s', f, e);
  }

  return defaultValue;
};

const _compare = (desired, actual) => {
  if (desired === undefined) {
    return true;
  }

  if (isFunction(desired)) {
    return safeInvoke(desired, false, actual);
  }

  if (isPlainObject(desired) && isPlainObject(actual)) {
    for (const [k, v] of Object.entries(desired)) {
      if (!compare(v, actual[k])) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(desired) && Array.isArray(actual)) {
    for (const [i, v] of desired.entries()) {
      if (!compare(v, actual[i])) {
        return false;
      }
    }

    return true;
  }

  if (isBuffer(desired) && isBuffer(actual)) {
    return desired.equals(actual);
  }

  if (isBuffer(desired) && isString(actual)) {
    return desired.toString('utf8') === actual;
  }

  if (isString(desired) && isBuffer(actual)) {
    return desired === actual.toString('utf8');
  }

  if (isString(desired) && isString(actual)) {
    return desired === actual;
  }

  if (isRegExp(desired) && isString(actual)) {
    return desired.test(actual);
  }

  if (isRegExp(desired) && isBuffer(actual)) {
    return desired.test(actual.toString('utf8'));
  }

  return false;
};

export const compare = (desired, actual) => {
  const res = _compare(desired, actual);

  if (!res) {
    DM(
      'actual value %s did not satisfy mock %s',
      ...[actual, desired].map((v) => valueToString(v, { colors: true }))
    );
  }

  return res;
};

const toStatusCode = (value, ...args) => {
  value = safeInvoke(value, undefined, ...args);
  return isInteger(value) ? value : 200;
};

const toHeaders = (value, ...args) => {
  value = safeInvoke(value, undefined, ...args);

  if (isPlainObject(value)) {
    return mapObj(value, ([k, v]) => [k, toBuffer(v, ...args)]);
  }

  return {};
};

const toBuffer = (value, ...args) => {
  value = safeInvoke(value, undefined, ...args);

  if (isBuffer(value)) {
    return value;
  }

  if (isString(value)) {
    return Buffer.from(value, 'utf8');
  }

  return Buffer.from([]);
};

const toDelay = (value, ...args) => {
  value = safeInvoke(value, undefined, ...args);
  return isInteger(value) ? value : 0;
};

const toDestroySocket = (value, ...args) => {
  value = safeInvoke(value, undefined, ...args);
  return isBoolean(value) ? value : false;
};

export const toHTTPRes = (res, req, reqBody) => {
  res = safeInvoke(res, undefined, req, reqBody);

  return {
    body: toBuffer(res?.body, req, reqBody),
    statusCode: toStatusCode(res?.statusCode, req, reqBody),
    headers: toHeaders(res?.headers, req, reqBody),
    headerDelay: toDelay(res?.headerDelay, req, reqBody),
    bodyDelay: toDelay(res?.bodyDelay, req, reqBody),
    destroySocket: toDestroySocket(res?.destroySocket, req, reqBody),
  };
};

export const toTCPRes = (res, req) => {
  res = safeInvoke(res, undefined, req);

  if (!isPlainObject(res)) {
    res = { body: res };
  }

  return {
    body: toBuffer(res?.body, req),
    bodyDelay: toDelay(res?.bodyDelay, req),
    destroySocket: toDestroySocket(res?.destroySocket, req),
  };
};

export const mapObj = (o, m) => Object.fromEntries(Object.entries(o).map(m));
export const wait = (m) => new Promise((r) => setTimeout(() => r(), m));

export const printMock = (mockType) => (obj) => {
  const parts = Object.entries(obj)
    .filter(([, v]) => !isUndefined(v))
    .map(([k, v]) => `${k}=${valueToString(v)}`);

  return `${mockType}{${parts.join(' ')}}`;
};
