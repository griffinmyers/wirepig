# Documentation

* **[`http`](/docs/http.md)** Mock an HTTP Server.
* **[`tcp`](/docs/tcp.md)** Mock a TCP Server.
* **[`helpers`](/docs/helpers.md)** Helpers you may fine useful in managing
  mocks.
* **[`errors`](/docs/errors.md)** The set of error types emitted by wirepig.

### Tips & Tricks

#### Be Explicit

The more explicit you are with defining your requests, the more you can be sure
that your application is sending what you expect over the wire.

That is, instead of defining a mock that will match _any_ request to `/bloop`:

```js
import { http } from 'wirepig';

const dep = await http();

dep.mock({
  req: { pathname: '/bloop' },
});
```

consider pinning other values as well:

```js
import { http } from 'wirepig';

const dep = await http();

dep.mock({
  req: {
    method: 'POST',
    pathname: '/bloop',
    body: '{"data":"bloop"}',
    query: '?sort=asc'
    headers: { 'content-type': 'application/json', 'content-length': '16' }
  }
});
```

Some values may be best pinned with a regular expression or function, depending
on how they change per request.

#### Write Helpers

Since wirepig's API is on the verbose side, write helper functions as needed.
For example, let's assume our server:

1) Always expects `POST` requests with a JSON body and appropriate headers
2) Always returns some JSON value

Something like this might help:

```js
import { isDeepStrictEqual } from 'node:util';
import { http } from 'wirepig';

const dep = await http();

const mockMyService = (pathname, req, res) => {
  const resBody = Buffer.from(JSON.stringify(res), 'utf8');

  return dep.mock({
    req: {
      method: 'POST',
      pathname,
      body: b => isDeepStrictEqual(JSON.parse(b), req),
      headers: {
        'content-type': 'application/json',
      }
    },
    res: {
      statusCode: 200,
      body: resBody,
      headers: {
        'content-type': 'application/json',
        'content-length': resBody.length.toString(10)
      }
    }
  });
}

mockMyService('/bloop', { data: 'bloop' }, { status: 'ok' });
````
