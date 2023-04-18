import http from 'node:http';
import { createConnection } from 'node:net';
import { Buffer } from 'node:buffer';
import { createHmac, createHash } from 'node:crypto';

export const req = ({
  port,
  pathname = '/',
  query = '',
  method = 'GET',
  headers,
  jsonBody,
  bufferBody,
  onEvent,
}) => {
  return new Promise((resolve, reject) => {
    let bodyBuffer = undefined;
    let bodyHeaders = {};

    if (jsonBody !== undefined) {
      bodyBuffer = Buffer.from(JSON.stringify(jsonBody), 'utf8');
      bodyHeaders = {
        'content-type': 'application/json',
        'content-length': bodyBuffer.length,
      };
    }

    if (bufferBody !== undefined) {
      bodyBuffer = Buffer.from(bufferBody, 'utf8');
      bodyHeaders = {
        'content-type': 'text/plain',
        'content-length': bodyBuffer.length,
      };
    }

    let path = pathname;
    if (query !== '') {
      path = `${path}${query}`;
    }

    if (Array.isArray(headers)) {
      headers = [
        ...Object.entries(bodyHeaders).flat(),
        'Host',
        `localhost:${port}`,
        ...headers,
      ];
    } else {
      headers = { ...bodyHeaders, ...headers };
    }

    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers,
    };

    const request = http.request(options, (res) => {
      onEvent?.('received-headers');
      let body = [];
      res.on('data', (c) => body.push(c));
      res.on('end', () => {
        const responseBody = Buffer.concat(body).toString('utf8');
        const json =
          res.headers['content-type'] === 'application/json'
            ? JSON.parse(responseBody)
            : null;

        resolve({ res, responseBody, json });
      });
    });

    request.on('error', reject);
    request.end(bodyBuffer);
  });
};

export const asyncSocket = async (options) => {
  let data = [];
  let awaitingData = [];
  let resolveClose;
  let closeSignal = new Promise((res) => {
    resolveClose = res;
  });

  const client = await new Promise((r) => {
    const c = createConnection(options, () => r(c));
  });

  const onData = (d) => {
    data.push(d);
    flush();
  };

  client.on('data', onData);
  client.on('close', () => resolveClose());

  const write = (d) => new Promise((r) => client.write(d, 'utf8', () => r()));

  const end = () => client.end();

  const read = ({ timeout = 100 } = {}) => {
    const p = new Promise((r) => awaitingData.push(r));
    flush();

    return new Promise((res, rej) => {
      let timedOut = false;

      p.then((v) => (timedOut ? onData(v) : res(v))).catch(rej);

      if (timeout !== undefined) {
        setTimeout(() => {
          timedOut = true;
          rej(new Error('Read timeout'));
        }, timeout);
      }
    });
  };

  const flush = () => {
    while (data.length > 0 && awaitingData.length > 0) {
      awaitingData.shift()(data.shift());
    }
  };

  return { write, read, end, closeSignal };
};

export const hexBuffer = (strings, ...intermediates) => {
  const bufferParts = strings.map((s) =>
    Buffer.from(s.replace(/[\n\s]/g, ''), 'hex')
  );

  const res = [];
  for (const [i, intermediate] of intermediates.entries()) {
    res.push(bufferParts[i]);
    res.push(intermediate);
  }

  res.push(bufferParts[bufferParts.length - 1]);
  return Buffer.concat(res);
};

// A function to compute the sasl server signature. Cribbed from [1].
//
// [1] https://github.com/brianc/node-postgres/blob/3e53d06cd891797469ebdd2f8a669183ba6224f6/packages/pg/lib/sasl.js#L19
export const saslSignature = ({
  password,
  clientNonce,
  serverNonce,
  serverSalt,
  serverIterations,
}) => {
  const hmacSha256 = (key, message) =>
    createHmac('sha256', key).update(message).digest();

  const xorBuffers = (a, b) => Buffer.from(a.map((_, i) => a[i] ^ b[i]));

  const Hi = (password, saltBytes, iterations) => {
    let ui1 = hmacSha256(
      password,
      Buffer.concat([saltBytes, Buffer.from([0, 0, 0, 1])])
    );
    let ui = ui1;
    for (let i = 0; i < iterations - 1; i++) {
      ui1 = hmacSha256(password, ui1);
      ui = xorBuffers(ui, ui1);
    }

    return ui;
  };

  const saltedPassword = Hi(
    password,
    Buffer.from(serverSalt, 'base64'),
    serverIterations
  );

  const serverKey = hmacSha256(saltedPassword, 'Server Key');

  const clientFirstMessageBare = `n=*,r=${clientNonce}`;
  const serverFirstMessage = `r=${serverNonce},s=${serverSalt},i=${serverIterations}`;
  const clientFinalMessageWithoutProof = `c=biws,r=${serverNonce}`;
  const authMessage = `${clientFirstMessageBare},${serverFirstMessage},${clientFinalMessageWithoutProof}`;

  const serverSignatureBytes = hmacSha256(serverKey, authMessage);

  return Buffer.from(serverSignatureBytes.toString('base64'), 'utf8');
};

export const sqsResponse = (messageBodies) => {
  const messages = messageBodies.map((body) => {
    const hash = createHash('md5').update(body).digest('hex');

    return `
      <Message>
        <MessageId>${body}</MessageId>
        <ReceiptHandle>${body}</ReceiptHandle>
        <MD5OfBody>${hash}</MD5OfBody>
        <Body>${body}</Body>
        <Attribute>
          <Name>SenderId</Name>
          <Value>3</Value>
        </Attribute>
        <Attribute>
          <Name>SentTimestamp</Name>
          <Value>2</Value>
        </Attribute>
        <Attribute>
          <Name>ApproximateReceiveCount</Name>
          <Value>5</Value>
        </Attribute>
        <Attribute>
          <Name>ApproximateFirstReceiveTimestamp</Name>
          <Value>1</Value>
        </Attribute>
      </Message>`;
  });

  return `
    <ReceiveMessageResponse>
      <ReceiveMessageResult>
        ${messages.join('\n')}
      </ReceiveMessageResult>
      <ResponseMetadata>
        <RequestId>request-id</RequestId>
      </ResponseMetadata>
    </ReceiveMessageResponse>
  `;
};
