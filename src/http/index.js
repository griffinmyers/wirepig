import { createServer } from 'node:http';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';

import { mockSchema, httpSchema } from './schema.js';
import {
  D,
  compare,
  toHTTPRes,
  wait,
  printMock,
  isString,
  isUndefined,
} from '../lib.js';
import { conform } from '../validate.js';
import { PendingMockError } from '../errors.js';

const printHTTP = printMock('HTTP');

const headers = (req) => {
  const res = {};

  let currentKey;
  for (const [i, v] of req.rawHeaders.entries()) {
    if (i % 2 === 0) {
      currentKey = v;
    } else {
      if (isUndefined(res[currentKey])) {
        res[currentKey] = v;
      } else if (isString(res[currentKey])) {
        res[currentKey] = [res[currentKey], v];
      } else {
        res[currentKey] = [...res[currentKey], v];
      }
    }
  }

  return res;
};

const parseReq = (req) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);

  return {
    method: req.method,
    pathname: parsed.pathname,
    query: parsed.search,
    headers: headers(req),
  };
};

const printReq = (req) => `[${req.method} ${req.url} HTTP/${req.httpVersion}]`;

const readBody = (req) =>
  new Promise((resolve) => {
    const body = [];

    req.on('data', (c) => body.push(c));
    req.on('end', () => resolve(Buffer.concat(body)));
  });

const Mock = (o) => {
  const options = conform(mockSchema(o, ['options'])) ?? {};

  let done = false;

  const match = () => {
    done = true;
  };

  const toString = () => printHTTP({ req: o?.req, res: o?.res });

  const isMatch = (req, body) => {
    if (!isPending()) {
      return false;
    }

    const { method, pathname, query, headers } = parseReq(req);

    return compare(options.req, {
      method,
      pathname,
      query,
      headers,
      body,
    });
  };

  const isPending = () => done === false;

  const assertDone = () => {
    if (isPending()) {
      throw new PendingMockError(`Mock is still pending: ${toString()}`);
    }
  };

  return {
    options,
    match,
    toString,
    isMatch,
    isPending,
    assertDone,
  };
};

const MockSet = () => {
  let mocks = [];

  const reset = ({ throwOnPending = true } = {}) => {
    const pending = mocks.filter((m) => m.isPending());
    mocks = [];

    if (pending.length !== 0) {
      if (throwOnPending) {
        throw new PendingMockError(
          `The following mocks are still pending: ${pending.join(', ')}`
        );
      }

      D('discarding the following mocks: %s', pending.join(', '));
    }
  };

  const add = (o) => {
    const m = Mock(o);
    mocks.push(m);
    D('registering mock %s', m);
    return m;
  };

  const handler = async (req, res) => {
    try {
      const reqBody = await readBody(req);
      D('received request %s', printReq(req));

      const m = mocks.find((m) => m.isMatch(req, reqBody));

      if (m !== undefined) {
        D('found matching mock %s', m);
        m.match();

        const r = toHTTPRes(m.options.res, req, reqBody);

        if (r.headerDelay > 0) {
          D('delaying writing headers by %dms', r.headerDelay);
          await wait(r.headerDelay);
        }

        D('writing status code %d', r.statusCode);
        D('writing headers %s', r.headers);
        res.writeHead(r.statusCode, r.headers);

        if (r.bodyDelay > 0) {
          D('delaying writing body by %dms', r.bodyDelay);
          res.flushHeaders();
          await wait(r.bodyDelay);
        }

        if (r.destroySocket) {
          D('purposefully destroying socket');
          res.destroy();
          return;
        }

        D('writing body %s', r.body);
        res.end(r.body);
      } else {
        D('no matching mock was found for %s', printReq(req));

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`No matching mock was found for ${printReq(req)}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return { reset, add, handler };
};

const http = (o) => {
  const options = conform(httpSchema(o, ['options'])) ?? {};
  const { port = 0 } = options;

  // closeAllConnections() added in v18.2.0
  const connections = [];

  return new Promise((resolve) => {
    const ms = MockSet();
    const server = createServer(ms.handler);
    D('launching http server');

    server.listen({ port });
    server.on('listening', () => {
      D('http server listening on port %d', server.address().port);

      resolve({
        port: server.address().port,
        teardown: () => {
          D('closing http server');
          connections.forEach((c) => c.destroy());
          return new Promise((r) => server.close(() => r()));
        },
        reset: (o) => ms.reset(o),
        mock: (o) => ms.add(o),
      });
    });

    server.on('connection', (c) => connections.push(c));
    server.on('close', () => D('http server closed'));
  });
};

export default http;
