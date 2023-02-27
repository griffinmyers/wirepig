import { isDeepStrictEqual } from 'node:util';
import { parse as parseQs } from 'node:querystring';
import { Buffer } from 'node:buffer';

const jsonMatch = (desired) => (actual) =>
  isDeepStrictEqual(JSON.parse(actual), desired);

const formMatch = (desired) => (actual) => {
  // parseQs return values will have a "null" prototype, and always fail value
  // equality checks with an Object literal. Accordingly, we're going to
  // manually copy they keys and values to our own literal to make comparison
  // simple.
  //
  const parsed = {};
  for (const [k, v] of Object.entries(parseQs(actual.toString('utf8')))) {
    parsed[k] = v;
  }

  return isDeepStrictEqual(parsed, desired);
};

const queryMatch = (desired) => (actual) => formMatch(desired)(actual.slice(1));

const textRes = (body, { statusCode = 200, headers = {} } = {}) => {
  const bodyBuffer = Buffer.from(body, 'utf8');

  return {
    body: bodyBuffer,
    statusCode,
    headers: {
      'content-type': 'text/plain',
      'content-length': bodyBuffer.length.toString(10),
      ...headers,
    },
  };
};

const jsonRes = (body, options = {}) =>
  textRes(JSON.stringify(body), {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });

export default {
  match: {
    json: jsonMatch,
    form: formMatch,
    query: queryMatch,
  },
  res: {
    text: textRes,
    json: jsonRes,
  },
};
