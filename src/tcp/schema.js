import {
  alias,
  always,
  or,
  and,
  obj,
  isUndefined,
  isPlainObject,
  branch,
  branchWithFunction,
  exclusive,
} from '../validate.js';

import {
  optComparable,
  optBufferable,
  funcOptBufferable,
  delay,
  destroySocket,
  port,
} from '../http/schema.js';

const resObj = obj({
  body: funcOptBufferable,
  bodyDelay: delay,
  destroySocket,
});

const res = branchWithFunction(
  [isPlainObject, optBufferable],
  [resObj, always],
  'if defined must be object, string, or buffer'
);

const connectionPinned = alias(
  exclusive(['init'], ['_pinnedTo']),
  'init not supported on a connection-pinned mock'
);

export const mockSchemaObj = and(
  obj({
    _pinnedTo: or(isUndefined, isPlainObject),
    init: optBufferable,
    req: optComparable,
    res,
  }),
  exclusive(['init'], ['req', 'res']),
  connectionPinned
);

export const mockSchema = branch(
  [isPlainObject, isUndefined],
  [mockSchemaObj, always],
  'if defined must be plain object'
);

export const tcpSchema = branch(
  [isPlainObject, isUndefined],
  [obj({ port }), always],
  'if defined must be plain object'
);
