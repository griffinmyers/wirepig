# TCP

* [Basic Usage](#basic-usage)
* [API Reference](#api-reference)
  * [`tcp(options): Promise<TCPMockServer>`](#tcpoptions-promisetcpmockserver)
  * [`TCPMockServer`](#tcpmockserver)
    * [`mock(options): Mock`](#mockoptions-mock)
    * [`reset(options): Void`](#resetoptions-void)
    * [`teardown(): Promise<Void>`](#teardown-promisevoid)
  * [Mock](#mock)
    * [`assertDone(): Void`](#assertdone-void)
    * [`mock(options): Mock`](#mockoptions-mock-1)
* [Examples](#examples)

## Basic Usage

In short, define:

* `req`, a description of the data in a TCP stream to match. This is how you
  assert that your software is sending the correct requests to its dependencies.
* `res`, a description of the data to reply with. This is how you assert that
  your software handles responses correctly.

or:

* `init`: a description of the data to write to a TCP stream when a new
connection is established.

```js
import { tcp } from 'wirepig';

const dep = await tcp();

dep.mock({ req: 'abcd', res: '1234' });

const client = await asyncSocket({ port: dep.port });
client.write('abcd');

const res = await client.read();
assert.deepStrictEqual(res.toString('utf8'), '1234');

await dep.teardown();
```

Mocks can only be matched once. If you need to accommodate many requests,
consider using a test lifecycle hook like `beforeEach` or some other construct,
like a `for` loop.

When a new connection with wirepig is established, it will start buffering all
writes it receives internally. With each write, it will evaluate all mocks
registered with the server to see if there is a match against all the data it's
received on that connection so far.

When a match is found, wirepig will write the response back over the socket and
clear its internal write buffer. Subsequent writes, and thus mock matching
evaluations, will then be carried out with the new buffer.

Writes from different connections accumulate in separate buffers.

## API Reference

Everything is optional unless stated otherwise.

### `tcp(options): Promise<TCPMockServer>`

Start a TCP mock server.

###### Arguments

* **`options`**: (`Object`)
  * **`port`**: (`Positive Int`) The port to bind to. By default, will find any
    available ephermal port.

###### Returns

[`Promise<TCPMockServer>`](#tcpmockserver) a Promise resolving to a handle on
the server.

### `TCPMockServer`

A handle on the TCP mock server.

###### Properties

* `port`: (`Positive Int`) the port the server is listening on.

###### Functions

#### `mock(options): Mock`

Declares a mock with the server. Will match at most one request.

All functions under `res` are passed the current data written to the socket and
expected to return the expected value in its position. For example, a function
at `options.res.body` will be passed current socket data and should return
either a String, Buffer, or undefined.

###### Arguments

* **`options`**: (`Object`)
  * **`init`**: (`String` | `Buffer`) Data to write to a connection when it is
    first established. If defined, `req` and `res` must not be.
  * **`req`**: (`String` | `Buffer` | `RegExp` | `Function: Boolean`) A
    description of the data to match. If a Function, will be passed the current
    data written to the connection and expected to return a Boolean.
  * **`res`**: (`Object` | `String` | `Buffer` | `Function`) A description of
    the data to send when a request matches. If an Object, the data at
    `res.body` will be written, else if String or Buffer, that data will be
    written.
    * **`body`**: (`String` | `Buffer` | `Function`)
    * **`bodyDelay`**: (`Positive Int` | `Function`) Any delay in milliseconds
      to inject before sending the response body.
    * **`destroySocket`**: (`Boolean` | `Function`) Whether or not to suddenly
      hang up the socket in the middle of serving a request. Helpful when
      testing error handling logic in an application.

###### Returns

[`Mock`](#mock) a handle on the mock.

#### `reset(options): Void`

Resets the mock server for the next test. If any mocks have been declared but
not matched, will by default throw a [`PendingMockError`](/docs/errors.md#pendingmockerror).
All previously declared mocks are discarded.

###### Arguments

* **`options`**: (`Object`)
  * **`throwOnPending`**: (`Boolean`) Whether or not to
    throw a [`PendingMockError`](/docs/errors.md#pendingmockerror) if there are
    declared but unmatched mocks.

#### `teardown(): Promise<Void>`

###### Returns

`Promise<Void>` a Promise resolving with nothing once the server is shut down.

### `Mock`

A handle on an individual mock.

###### Functions

#### `assertDone(): Void`

Throws a [`PendingMockError`](/docs/errors.md#pendingmockerror) if the mock has
not yet been matched.

#### `mock(options): Mock`

Declares a mock with the same options as
[`TCPMockServer.mock()`](#mockoptions-mock), except pinned to the same
connection as the mock the function was called on. The new mock will not match
any writes from other connections.

Pinned mocks cannot specify `init` values, since they're necessarily not the
first data written over a socket.

## Examples

#### Basic Request/Response Pair

This example shows the expected request/response pair from issuing a `GET`
request to a redis server.

```js
import { tcp } from 'wirepig';

const dep = await tcp();

dep.mock({
  req: ['*2', '$3', 'GET', '$15', 'namespace:bloop', ''].join('\r\n'),
  res: ['$17', 'bloop-the-big-one', ''].join('\r\n'),
});
```

Once wirepig sees the exact sequence of bytes from `req` written to it, it'll
write `res` back out on the socket.

#### Request Matching

Wirepig is quite flexible in matching requests. Writes can be compared by
specifying any of:

| Type | Match Behavior |
| -- | -- |
| `String` | Strict equality (case-sensitive); assumes UTF-8 encoding |
| `Buffer` | Strict byte-for-byte equality |
| `RegExp` | Whether or not the regular expression matches the value |
| `Function` | Whether or not the function returns `true` |

```js
dep.mock({ req: 'bloop' });
dep.mock({ req: Buffer.from('bloop', 'utf8') });
dep.mock({ req: /^blo+p$/ });
dep.mock({ req: bytes => bytes.length === 4 });
```

#### Response Filling

Wirepig is similarly flexible in defining responses. Bufferable values can be
passed as:

| Type | Coercion Behavior |
| -- | -- |
| `String` | Coerced to UTF-8 encoded Buffer |
| `Buffer` | Passed as-is |
| `Function` | Called, then handled as String or Buffer |


```js
dep.mock({ res: 'bloop' });
dep.mock({ res: Buffer.from('bloop', 'utf8') });
dep.mock({ res: bytes => `request: ${bytes}` });
```

#### Init

Some protocols expect the server to be the first to write to a connection (mysql
is a good example).

To handle this, we can declare a mock with the `init` key. When a wirepig
receives a new connection, it'll find the first pending "init" mock and write it
to the socket.

```js
dep.mock({ init: Buffer.from('hello from the server', 'utf8') });
dep.mock({ req: 'SELECT 1 + 1;', res: '2' });
```

#### Connection Pinning

The previous example showed two mocks we expected to occur over the same
connection. However, the way we've written it, the first could have been
satisfied by one connection, and the second by another.

To "pin" mocks to a given connection, we can use the
[`Mock.mock()`](#mockoptions-mock-1) function:

```js
const handshake = dep.mock({
  init: Buffer.from('hello from the server', 'utf8')
});

const query = handshake.mock({
  req: 'SELECT 1 + 1;', res: '2'
});
```

Here, `query` will only match a write of `SELECT 1 + 1;` if it occurred on the
same connection that `handshake used.

#### Many Mocks and Many Writes

To better understand how wirepig handles the streaming nature of TCP, consider
the following set of mocks:

```js
dep.mock({ req: 'abcd', res: 'bloop' });
dep.mock({ req: '1234', res: 'bleep' });
````

Assume we establish a single connection with wirepig, then do the following:

1. We write `ab` to the socket. Wirepig will buffer `ab` and check all its mocks
   for a match. Since `ab` doesn't match `abcd` or `1234`, it does nothing.
2. We write `cd` to the socket. Wirepig will update its buffer to `abcd` and
   check all its mocks. When it determines the first mock matches, it writes
   `bloop` to the connection, which we read. Wirepig then clears out its buffer.
3. We write `1234` to the socket. Since wirepig's buffer was just cleared when
   it matched the last mock, it'll immediately see it has another matching mock
   available to it. Wirepig will write `bleep` to the connection and once again
   clear its buffer.
