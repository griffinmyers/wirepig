import { createServer } from 'node:net';
import { Buffer } from 'node:buffer';

import { mockSchema, tcpSchema } from './schema.js';
import { D, DM, compare, toTCPRes, wait, printMock } from '../lib.js';
import { conform } from '../validate.js';
import { PendingMockError } from '../errors.js';

const printTCP = printMock('TCP');

const Mock = (o, addToMockSet) => {
  const options = conform(mockSchema(o, ['options'])) ?? {};

  let done = false;
  let [isHeadMock, pinnedTo] =
    options._pinnedTo === undefined
      ? [true, { connection: null }]
      : [false, options._pinnedTo];

  const match = (connection) => {
    done = true;

    if (isHeadMock) {
      D('pinning head mock %s to port %s', toString(), connection.remotePort);
      pinnedTo.connection = connection;
    }
  };

  const toString = () => printTCP({ init: o?.init, req: o?.req, res: o?.res });

  const isMatch = (bytes, connection) => {
    if (isInit() || !isPending() || !compare(options.req, bytes)) {
      return false;
    }

    if (isHeadMock) {
      return true;
    }

    const matchesPinnedConnection = pinnedTo.connection === connection;

    if (!matchesPinnedConnection) {
      DM(
        '%s is pinned to connection on port %s but request was on port %s',
        toString(),
        pinnedTo.connection?.remotePort ?? 'PENDING',
        connection.remotePort
      );
    }

    return matchesPinnedConnection;
  };

  const isInit = () => options.init !== undefined;

  const isPending = () => done === false;

  const assertDone = () => {
    if (isPending()) {
      throw new PendingMockError(`Mock is still pending: ${toString()}`);
    }
  };

  const mock = (o) => addToMockSet({ ...o, _pinnedTo: pinnedTo });

  return {
    options,
    match,
    toString,
    isMatch,
    isInit,
    isPending,
    assertDone,
    mock,
  };
};

const MockSet = () => {
  let mocks = [];
  let connections = [];

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
    const m = Mock(o, add);
    mocks.push(m);
    D('registering mock %s', m);
    return m;
  };

  const handler = (conn) => {
    const DPort = (message, ...args) =>
      D(`[port=${conn.remotePort}] ${message}`, ...args);

    DPort('new connection established');
    connections.push(conn);
    let recv = Buffer.from([]);

    const iM = mocks.find((m) => m.isInit() && m.isPending());
    if (iM !== undefined) {
      DPort('found matching init mock %s', iM);
      iM.match(conn);
      DPort('writing "%s"', iM.options.init);
      conn.write(iM.options.init);
    }

    conn.on('data', async (b) => {
      try {
        recv = Buffer.concat([recv, b]);
        DPort('received data "%s"', b);
        DPort('internal receive buffer is now "%s"', recv);

        const m = mocks.find((m) => m.isMatch(recv, conn));
        if (m !== undefined) {
          DPort('found matching mock %s', m);
          m.match(conn);

          const r = toTCPRes(m.options.res, recv);
          recv = Buffer.from('');

          if (r.bodyDelay > 0) {
            DPort('delaying write by %dms', r.bodyDelay);
            await wait(r.bodyDelay);
          }

          if (r.destroySocket) {
            DPort('purposefully destroying socket');
            conn.destroy();
            return;
          }

          DPort('writing "%s"', r.body);
          conn.write(r.body);
        } else {
          DPort('no matching mock was found for "%s"', recv);
        }
      } catch (e) {
        console.error(e);
      }
    });

    conn.on('close', () => DPort('connection closed'));
    conn.on('error', (e) => DPort('received error %s', e));
  };

  const teardown = () => {
    for (const c of connections) {
      c.destroy();
    }
  };

  return {
    reset,
    add,
    handler,
    teardown,
  };
};

const tcp = (o) => {
  const options = conform(tcpSchema(o, ['options'])) ?? {};
  const { port = 0 } = options;

  return new Promise((resolve, reject) => {
    const ms = MockSet();
    const server = createServer({ noDelay: true }, ms.handler);
    D('launching tcp server');

    server.listen({ port });
    server.on('listening', () => {
      D('tcp server listening on port %d', server.address().port);

      resolve({
        port: server.address().port,
        teardown: () => {
          D('closing tcp server');
          return new Promise((r) => {
            ms.teardown();
            server.close(r);
          });
        },
        reset: (o) => ms.reset(o),
        mock: (o) => ms.add(o),
      });
    });

    server.on('error', (e) => {
      reject(e);
      D('received error %s', e);
    });

    server.on('close', () => D('tcp server closed'));
  });
};

export default tcp;
