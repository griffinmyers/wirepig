import { Buffer } from 'node:buffer';
import { http, tcp, helpers, errors } from '../../';

const { ValidationError, PendingMockError } = errors;

http();
http({});
const httpDep = await http({ port: 1989 });
httpDep.mock();
httpDep.mock({});
httpDep.mock({ req: {} });
httpDep.mock({ req: (req) => req.method === 'GET' });

httpDep.mock({
  req: {
    method: undefined,
    pathname: undefined,
    query: undefined,
    headers: { 'x-bloop': undefined },
    body: undefined,
  },
});

httpDep.mock({
  req: {
    method: 'GET',
    pathname: '/bloop',
    query: '?a=1',
    headers: { 'x-bloop': 'true' },
    body: 'body',
  },
});

httpDep.mock({
  req: {
    method: Buffer.from('GET', 'utf8'),
    pathname: Buffer.from('/bloop', 'utf8'),
    query: Buffer.from('?a=1', 'utf8'),
    headers: { 'x-bloop': Buffer.from('true', 'utf8') },
    body: Buffer.from('body', 'utf8'),
  },
});

httpDep.mock({
  req: {
    method: /GET/,
    pathname: /\/bloop/,
    query: /?a=1/,
    headers: { 'x-bloop': /true/ },
    body: /body/,
  },
});

httpDep.mock({
  req: {
    headers: { 'x-bloop': ['true', Buffer.from('true', 'utf8'), /true/] },
  },
});

httpDep.mock({
  req: {
    method: (m) => m.startsWith('P'),
    pathname: (p) => p.startsWith('/'),
    query: (q) => q.startsWith('?'),
    headers: (h) => true,
    body: (b) => b.equals(Buffer.from('a', 'utf8')),
  },
});

httpDep.mock({
  req: {
    headers: { 'x-bloop': (h) => true },
  },
});

httpDep.mock({
  req: {
    headers: { 'x-bloop': [(h) => true] },
  },
});

httpDep.mock({ res: {} });

httpDep.mock({
  res: (req, reqBody) => ({ body: req.method, statusCode: 200 }),
});

httpDep.mock({
  res: {
    body: undefined,
    headers: { 'x-bloop': undefined },
    statusCode: undefined,
    headerDelay: undefined,
    bodyDelay: undefined,
    destroySocket: undefined,
  },
});

httpDep.mock({
  res: {
    body: 'body',
    headers: { 'x-bloop': 'true' },
    statusCode: 200,
    headerDelay: 0,
    bodyDelay: 0,
    destroySocket: true,
  },
});

httpDep.mock({
  res: {
    body: Buffer.from('body', 'utf8'),
    headers: {
      'x-bloop': Buffer.from('true', 'utf8'),
      'x-bleep': ['1', Buffer.from('2', 'utf8'), () => '3', undefined],
      'x-bleep-2': () => ['1', Buffer.from('2', 'utf8'), () => '3', undefined],
    },
  },
});

httpDep.mock({
  res: {
    body: (req, reqBody) => `req: ${reqBody}`,
    headers: () => ({ 'x-bloop': 'true' }),
    statusCode: () => 200,
    headerDelay: () => 0,
    bodyDelay: () => 0,
    destroySocket: () => true,
  },
});

httpDep.mock({
  res: {
    body: (req, reqBody) => Buffer.concat([reqBody, reqBody]),
    headers: () => ({ 'x-bloop': Buffer.from('true', 'utf8') }),
  },
});

httpDep.mock({
  res: {
    headers: () => undefined,
  },
});

httpDep.mock({
  res: {
    headers: () => ({
      'x-bloop': () => 'true',
      'x-bleep': () => Buffer.from('true', 'utf8'),
      'x-blorp': () => undefined,
    }),
  },
});

httpDep.mock({
  res: {
    headers: {
      'x-bloop': () => 'true',
      'x-bleep': () => Buffer.from('true', 'utf8'),
      'x-blorp': () => undefined,
    },
  },
});

httpDep.reset();
httpDep.reset({});
httpDep.reset({ throwOnPending: false });
await httpDep.teardown();

const httpMock = httpDep.mock();
httpMock.assertDone();

tcp();
tcp({});
const tcpDep = await tcp({ port: 1989 });

tcpDep.mock();
tcpDep.mock({});
tcpDep.mock({ init: undefined, req: undefined, res: undefined });

tcpDep.mock({ init: 'init' });
tcpDep.mock({ init: Buffer.from('init', 'utf8') });

tcpDep.mock({ req: 'req' });
tcpDep.mock({ req: Buffer.from('req', 'utf8') });
tcpDep.mock({ req: /req/ });
tcpDep.mock({ req: (r) => r.equals(Buffer.from('bloop', 'utf8')) });

tcpDep.mock({ res: 'res' });
tcpDep.mock({ res: Buffer.from('res', 'utf8') });
tcpDep.mock({ res: {} });
tcpDep.mock({ res: { body: undefined } });
tcpDep.mock({ res: { body: 'res' } });
tcpDep.mock({ res: { body: Buffer.from('res', 'utf8') } });
tcpDep.mock({ res: { body: (r) => undefined } });
tcpDep.mock({ res: { body: (r) => `req: ${r}` } });
tcpDep.mock({
  res: { body: (r) => Buffer.concat([r, Buffer.from('bloop', 'utf8')]) },
});
tcpDep.mock({ res: { bodyDelay: undefined } });
tcpDep.mock({ res: { bodyDelay: 2 } });
tcpDep.mock({ res: { bodyDelay: () => 2 } });
tcpDep.mock({ res: { destroySocket: true } });
tcpDep.mock({ res: { destroySocket: () => true } });
tcpDep.mock({ res: (r) => 'res' });
tcpDep.mock({ res: (r) => Buffer.from('res', 'utf8') });
tcpDep.mock({ res: (r) => ({}) });
tcpDep.mock({ res: (r) => ({ body: undefined }) });
tcpDep.mock({ res: (r) => ({ body: 'res' }) });
tcpDep.mock({ res: (r) => ({ body: Buffer.from('res', 'utf8') }) });
tcpDep.mock({ res: (r) => ({ body: () => undefined }) });
tcpDep.mock({ res: (r) => ({ body: () => `req: ${r}` }) });
tcpDep.mock({
  res: (r) => ({
    body: () => Buffer.concat([r, Buffer.from('bloop', 'utf8')]),
  }),
});
tcpDep.mock({ res: (r) => ({ bodyDelay: undefined }) });
tcpDep.mock({ res: (r) => ({ bodyDelay: 2 }) });
tcpDep.mock({ res: (r) => ({ bodyDelay: () => 2 }) });
tcpDep.mock({ res: (r) => ({ destroySocket: true }) });
tcpDep.mock({ res: (r) => ({ destroySocket: () => true }) });

tcpDep.reset();
tcpDep.reset({});
tcpDep.reset({ throwOnPending: false });
await tcpDep.teardown();

const tcpMock = tcpDep.mock();
tcpMock.assertDone();

const pinnedTCPMock = tcpMock.mock({ init: 'init', req: 'req', res: 'res' });
pinnedTCPMock.assertDone();

helpers.match.json(1);
helpers.match.json('1');
helpers.match.json(null);
helpers.match.json(true);
helpers.match.json({ a: 1, b: '1', c: null, d: true, e: [1] });
helpers.match.json([1, '1', null, true, { a: 1 }]);
helpers.match.json(1)(Buffer.from('bloop', 'utf8'));

helpers.match.form({});
helpers.match.form({ a: 'a' });
helpers.match.form({ a: ['a', 'b'] });
helpers.match.form({})(Buffer.from('bloop', 'utf8'));

helpers.match.query({});
helpers.match.query({ a: 'a' });
helpers.match.query({ a: ['a', 'b'] });
helpers.match.query({})(Buffer.from('bloop', 'utf8'));

helpers.res.text('bloop');
helpers.res.text('bloop', {});
helpers.res.text('bloop', { statusCode: 200 });
helpers.res.text('bloop', { headers: {} });
helpers.res.text('bloop', { headers: { 'x-bloop': 'true' } });
helpers.res.text('bloop', { statusCode: 200, headers: { 'x-bloop': 'true' } });

helpers.res.json('bloop');
helpers.res.json('bloop', {});
helpers.res.json('bloop', { statusCode: 200 });
helpers.res.json('bloop', { headers: {} });
helpers.res.json('bloop', { headers: { 'x-bloop': 'true' } });
helpers.res.json('bloop', { statusCode: 200, headers: { 'x-bloop': 'true' } });

new ValidationError('Invalid');
new PendingMockError('Pending');
