import { Buffer } from 'buffer';
import { IncomingMessage } from 'http';

type Comparable = string | Buffer | RegExp | undefined;
type ComparableHeader =
  | ((header: string | Array<string>) => boolean)
  | Comparable;

type ComparableHeaders = {
  [key: string]: ComparableHeader | Array<ComparableHeader>;
};

type MatchHeaders = { [key: string]: string | Array<string> };
type HTTPMatchReq = {
  method: string;
  pathname: string;
  query: string;
  headers: MatchHeaders;
  body: Buffer;
};

type OptBufferable = string | Buffer | undefined;

type HTTPFuncOptBufferable =
  | ((req: IncomingMessage, reqBody: Buffer) => OptBufferable)
  | OptBufferable;
type TCPFuncOptBufferable = ((req: Buffer) => OptBufferable) | OptBufferable;

type HTTPFuncOptNumberable =
  | ((req: IncomingMessage, reqBody: Buffer) => number | undefined)
  | number
  | undefined;
type TCPFuncOptNumberable =
  | ((req: Buffer) => number | undefined)
  | number
  | undefined;

type HTTPFuncOptBoolable =
  | ((req: IncomingMessage, reqBody: Buffer) => boolean | undefined)
  | boolean
  | undefined;
type TCPFuncOptBoolable =
  | ((req: Buffer) => boolean | undefined)
  | boolean
  | undefined;

type HTTPHeaderValue = OptBufferable | Array<HTTPFuncOptBufferable>;
type HTTPFuncHeaderValue =
  | ((req: IncomingMessage, reqBody: Buffer) => HTTPHeaderValue)
  | HTTPHeaderValue;

type HTTPResHeaders = { [key: string]: HTTPFuncHeaderValue } | undefined;

type HTTPRes = {
  body?: HTTPFuncOptBufferable;
  statusCode?: HTTPFuncOptNumberable;
  headers?:
    | ((req: IncomingMessage, reqBody: Buffer) => HTTPResHeaders)
    | HTTPResHeaders;
  headerDelay?: HTTPFuncOptNumberable;
  bodyDelay?: HTTPFuncOptNumberable;
  destroySocket?: HTTPFuncOptBoolable;
};

type HTTPMock = {
  assertDone(): void;
};

type HTTPMockOptions = {
  req?:
    | ((req: HTTPMatchReq) => boolean)
    | {
        method?: ((method: string) => boolean) | Comparable;
        pathname?: ((pathname: string) => boolean) | Comparable;
        query?: ((query: string) => boolean) | Comparable;
        headers?: ((headers: MatchHeaders) => boolean) | ComparableHeaders;
        body?: ((body: Buffer) => boolean) | Comparable;
      };
  res?: ((req: IncomingMessage, reqBody: Buffer) => HTTPRes) | HTTPRes;
};

type HTTPMockServer = {
  port: number;
  mock(options?: HTTPMockOptions): HTTPMock;
  reset(options?: { throwOnPending?: boolean }): void;
  teardown(): Promise<void>;
};

type TCPMock = {
  mock(options?: TCPMockOptions): TCPMock;
  assertDone(): void;
};

type TCPRes =
  | OptBufferable
  | {
      body?: TCPFuncOptBufferable;
      bodyDelay?: TCPFuncOptNumberable;
      destroySocket?: TCPFuncOptBoolable;
    };

type TCPMockOptions = {
  init?: OptBufferable;
  req?: ((req: Buffer) => boolean) | Comparable;
  res?: ((req: Buffer) => TCPRes) | TCPRes;
};

type TCPMockServer = {
  port: number;
  mock(options?: TCPMockOptions): TCPMock;
  reset(options?: { throwOnPending?: boolean }): void;
  teardown(): Promise<void>;
};

type ResOptions = {
  statusCode?: number;
  headers?: { [key: string]: string };
};

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | Array<JSONValue>;

type FormValue = { [key: string]: string | Array<string> };
type QueryValue = FormValue;

type Helpers = {
  match: {
    json: (desired: JSONValue) => (actual: Buffer) => boolean;
    form: (desired: FormValue) => (actual: Buffer) => boolean;
    query: (desired: QueryValue) => (actual: Buffer) => boolean;
  };
  res: {
    text: (body: string, options?: ResOptions) => HTTPRes;
    json: (body: string, options?: ResOptions) => HTTPRes;
  };
};

declare class ValidationError extends Error {
  constructor(message: string);
}

declare class PendingMockError extends Error {
  constructor(message: string);
}

type Errors = {
  ValidationError: typeof ValidationError;
  PendingMockError: typeof PendingMockError;
};

export function http(options?: { port?: number }): Promise<HTTPMockServer>;
export function tcp(options?: { port?: number }): Promise<TCPMockServer>;
export const helpers: Helpers;
export const errors: Errors;
