# HTTP

* [Basic Usage](#basic-usage)
* [API Reference](#api-reference)
  * [`http(options): Promise<HTTPMockServer>`](#httpoptions-promisehttpmockserver)
  * [`HTTPMockServer`](#httpmockserver)
    * [`mock(options): Mock`](#mockoptions-mock)
    * [`reset(options): Void`](#resetoptions-void)
    * [`teardown(): Promise<Void>`](#teardown-promisevoid)
  * [Mock](#mock)
    * [`assertDone(): Void`](#assertdone-void)
* [Examples](#examples)

## Basic Usage

In short, define:

* `req`, a description of the HTTP request to match. This is how you assert
  that your software is sending the correct requests to its dependencies.
* `res`, a description of the HTTP response to reply with. This is how you
  assert that your software handles responses correctly.

```js
import { http } from 'wirepig';

const dep = await http();

const mock = dep.mock({
  req: { method: 'POST', pathname: '/bloop' },
  res: { statusCode: 200, body: 'bloop' },
});

const res = await request.post(`http://localhost:${dep.port}/bloop`)

assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.text, 'bloop');

await dep.teardown();
```

Mocks can only be matched once. If you need to accommodate many requests,
consider using a test lifecycle hook like `beforeEach` or some other construct,
like a `for` loop.

## API Reference

Everything is optional unless stated otherwise.

### `http(options): Promise<HTTPMockServer>`

Start an HTTP mock server.

###### Arguments

* **`options`**: (`Object`)
  * **`port`**: (`Positive Int`) The port to bind to. By default, will find any
    available ephermal port.

###### Returns

[`Promise<HTTPMockServer>`](#httpmockserver) a Promise resolving to a handle on
the server.

### `HTTPMockServer`

A handle on the HTTP mock server.

###### Properties

* `port`: (`Positive Int`) the port the server is listening on.

###### Functions

#### `mock(options): Mock`

Declares a mock with the server.

All functions under `req` are passed the value at their position in `options`
and are expected to return a Boolean. For example, a function at
`options.req.method` will be passed just the request method and should return
`true` or `false`.

All functions under `res` are passed the raw [node request](https://nodejs.org/api/http.html#class-httpincomingmessage)
and request body (as a Buffer) and expected to return an appropriate value for
its position. For example, a function at `options.res.body` will be passed the
request and request body and should return either a String, Buffer, or
undefined.

`Comparable` = `String` | `Buffer` | `RegExp` | `Function: Boolean`

###### Arguments

* **`options`**: (`Object`)
  * **`req`**: (`Object` | `Function`) A description of a request to match.
    * **`method`**: (`Comparable`) Request method.
    * **`pathname`**: (`Comparable`) Request pathname with leading `/` and no
      querystring.
    * **`query`**: (`Comparable`) Request querystring including leading `?`
    * **`headers`**: (`Object` | `Function`) Request headers.
      * **`$key`**: (`Comparable` | `Array<Comparable>`) An individual header,
        case sensitive. If multiple headers with the same name are expected,
        supply an Array of their values.
    * **`body`**: (`Comparable`) Request body.
  * **`res`**: (`Object` | `Function`) A description of the response to send
    when a request matches.
    * **`body`**: (`String` | `Buffer` | `Function`) Response body.
    * **`headers`**: (`Object` | `Function`) Response headers.
      * **`$key`**: (`String` | `Buffer` | `Function`) An individual response
      header.
    * **`statusCode`**: (`Positive Int` | `Function`) Valid response status
      code.
    * **`headerDelay`**: (`Positive Int` | `Function`) Any delay in milliseconds
      to inject before sending the response status line.
    * **`bodyDelay`**: (`Positive Int` | `Function`) Any delay in milliseconds
      to inject before sending the response body.
    * **`destroySocket`**: (`Boolean` | `Function`) Whether or not to suddenly
      hang up the socket in the middle of serving a request. Helpful when
      testing error handling logic in an application

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

## Examples

#### Basic Request/Response Pair

The following example matches a `POST /bloop HTTP/1.1` request and responds
successfully with the JSON value `{ data: 'bloop' }`.

```js
import { http } from 'wirepig';

const dep = await http();

dep.mock({
  req: {
    method: 'POST',
    pathname: '/bloop',
    body: '{"data":"bloop"}',
    headers: { 'content-type': 'application/json', 'content-length': '16' }
  },
  res: {
    statusCode: 200,
    body: '{"data":"bloop"}',
    headers: { 'content-type': 'application/json', 'content-length': '16' }
  },
});
```

All attributes defined in `req` must be satisfied for the mock to match a
request. In this example, we didn't specify `req.query`, meaning this mock will
match a request regardless of what its query is.

All attributes defined in `res` have sensible defaults. For example, if we
hadn't specified `req.statusCode`, wirepig would have replied with a `200 OK`
anyways.

#### Using Helpers

The [helpers](/docs/helpers.md) provided in this package can additionally help
with common formats, like JSON. With them, the preceding example becomes:

```js
import { http, helpers } from 'wirepig';
const { match, res } = helpers;

const dep = await http();

dep.mock({
  req: {
    method: 'POST',
    pathname: '/bloop',
    body: match.json({ data: 'bloop' }),
    headers: { 'content-type': 'application/json', 'content-length': '16' }
  },
  res: res.json({ data: 'bloop' })
});
```

#### Using Functions

Functions are a handy way of configuring match and response behavior.

This example uses functions at the top level. It'll match any `PUT` or `POST`
request and echo the request body as the response.

```js
dep.mock({
  req: (req) => req.method.startsWith('P'),
  res: (req, reqBody) => { body: reqBody },
});
```

Functions can be placed nearly anywhere.

```js
dep.mock({
  req: {
    method: (method) => method.startsWith('P')
  },
  res: {
    body: (req, reqBody) => reqBody
  }
});
```

I mean really, anywhere.

```js
dep.mock({
  req: {
    headers: { 'content-type': c => c.endsWith('json') }
  },
  res: {
    body: (req, reqBody) => reqBody
  }
});
```

Functions under `req` are always passed the actual value being compared at its
position and expected to return a boolean.

Functions under `res` are always passed the raw [node request](https://nodejs.org/api/http.html#class-httpincomingmessage) and request body (as a Buffer) and expected
to return the expected value in its position.

#### Request Matching

Wirepig is quite flexible in matching requests. String/Buffer values can be
compared by specifying any of:

| Type | Match Behavior |
| -- | -- |
| `String` | Strict equality (case-sensitive); assumes UTF-8 encoding |
| `Buffer` | Strict byte-for-byte equality |
| `RegExp` | Whether or not the regular expression matches the value |
| `Function` | Whether or not the function returns `true` |

Objects and Arrays are compared by iterating their entries and performing the
same comparison. Any entries not specified in `req` will always match (for
example, any headers not listed).

```js
dep.mock({
  req: {
    method: 'POST',
    pathname: Buffer.from('/bloop', 'utf8'),
    body: /^blo+p$/,
    headers: { 'content-type': c.endsWith('json'), 'content-length': /d+/ }
  }
});
```

#### Response Filling

Wirepig is similarly flexible in defining responses. Bufferable values can be
passed as:

| Type | Coercion Behavior |
| -- | -- |
| `String` | Coerced to UTF-8 encoded Buffer |
| `Buffer` | Passed as-is |
| `Function` | Called, then handled as String or Buffer |

Objects and Arrays are fulfilled by iterating their entries and performing the
same coercion.

```js
dep.mock({
  res: {
    statusCode: (req) => req.pathname === '/bloop' ? 200 : 404,
    body: Buffer.from('{"data":"bloop"}', 'utf8'),
    headers: {
      'content-type': 'application/json',
      'content-length': '16'
      'x-echo': (req, reqBody) => Buffer.from(`request: ${reqBody}`, 'utf8')
    }
  },
});
```

#### Duplicate Headers

In the event that your application sends duplicate header values, they'll be
matched as an array.

```js
dep.mock({
  req: {
    headers: {
      'x-bloop': ['bloop', 'true']
    }
  }
});
```

Naturally, mix and match Strings, Buffers, Regular Expressions, and Functions to
taste:

```js
dep.mock({
  req: {
    headers: {
      'x-bloop': [/^blo+p$/, v => v.startsWith('t')]
    }
  }
});
```
