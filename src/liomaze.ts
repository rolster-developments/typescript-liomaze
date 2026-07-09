import { delayPromise, fromPromise, normalizeJson } from '@rolster/commons';
import axios, { AxiosRequestConfig } from 'axios';
import { mergePayload, normalizePayload } from './helpers';
import { HttpMethod, HttpPayload, HttpRetry } from './types';

interface HttpOptions {
  headers?: LiteralObject;
  payload?: HttpPayload;
  queryParams?: LiteralObject;
  retry?: HttpRetry | false;
  withCredentials?: boolean;
}

interface FileOptions {
  headers?: LiteralObject;
  payload?: FormData;
  retry?: HttpRetry | false;
  withCredentials?: boolean;
}

type Result = void | Promise<void>;
type BuilderHeader = (key: string, value: any) => Result;

interface BuilderHeadersOptions {
  header: BuilderHeader;
  method: HttpMethod;
  url: string;
}

interface BuilderInterceptorsOptions {
  interceptor: Interceptor;
  method: HttpMethod;
  url: string;
}

type BuilderHeaders = (options: BuilderHeadersOptions) => Result;
type BuilderInterceptors = (options: BuilderInterceptorsOptions) => Result;

interface LiomazeConfiguration {
  interceptors: BuilderInterceptors[];
  catchError?: (error: Error) => Error;
  headers?: BuilderHeaders;
  retry?: HttpRetry;
  withCredentials?: boolean;
}

interface CreatorOptions {
  method: HttpMethod;
  url: string;
  headers?: LiteralObject;
  payload?: HttpPayload;
}

interface RequestResult {
  headers: LiteralObject<any>;
  payload?: HttpPayload;
}

interface DispatchOptions {
  method: HttpMethod;
  url: string;
  headers?: LiteralObject;
  payload?: HttpPayload;
  queryParams?: LiteralObject;
  retry?: HttpRetry | false;
  withCredentials?: boolean;
}

class Interceptor {
  private readonly headers: LiteralObject = {};

  private _payload?: HttpPayload;

  public header(key: string, value: any): void {
    this.headers[key] = String(value);
  }

  public payload(payload: HttpPayload): void {
    this._payload = payload;
  }

  public build(
    globals: LiteralObject,
    headers?: LiteralObject<any>,
    payload?: HttpPayload
  ): RequestResult {
    return {
      headers: { ...globals, ...this.headers, ...headers },
      payload: mergePayload(this._payload, payload)
    };
  }
}

const configuration: LiomazeConfiguration = {
  interceptors: []
};

async function createHeaders(
  method: HttpMethod,
  url: string
): Promise<LiteralObject> {
  const headers: LiteralObject = {};

  if (configuration.headers) {
    await fromPromise(
      configuration.headers({
        method,
        url,
        header: (key: string, value: any) => {
          headers[key] = value;
        }
      })
    );
  }

  return headers;
}

async function createRequest(options: CreatorOptions): Promise<RequestResult> {
  const headers = await createHeaders(options.method, options.url);

  const interceptor = new Interceptor();

  await Promise.all(
    configuration.interceptors.map((resolver) =>
      fromPromise(
        resolver({
          interceptor,
          method: options.method,
          url: options.url
        })
      )
    )
  );

  return interceptor.build(headers, options.headers, options.payload);
}

function resolveRetry(local?: HttpRetry | false): Undefined<HttpRetry> {
  if (local === false) {
    return undefined;
  }

  return local ?? configuration.retry;
}

function shouldRetryOnError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return true;
    }

    return err.response.status >= 500;
  }

  return false;
}

async function sendWithRetry<T>(
  send: () => Promise<T>,
  retry?: HttpRetry
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await send();
    } catch (err) {
      if (retry && attempt < retry.attempts && shouldRetryOnError(err)) {
        attempt++;

        if (retry.delay) {
          const backoff = retry.delay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * backoff * 0.25;

          await delayPromise(() => undefined, backoff + jitter);
        }

        continue;
      }

      throw err;
    }
  }
}

function refactorError(err: any): Error {
  const error =
    axios.isAxiosError(err) && err.response
      ? new HttpError(
          err.response.status,
          err.response.statusText,
          err.response.data
        )
      : err;

  return configuration.catchError ? configuration.catchError(error) : error;
}

async function dispatch<T>(options: DispatchOptions): Promise<T> {
  try {
    const { headers, payload } = await createRequest({
      method: options.method,
      url: options.url,
      headers: options.headers,
      payload: options.payload
    });

    const withCredentials =
      options.withCredentials ?? configuration.withCredentials;

    const request: AxiosRequestConfig = {
      headers,
      method: options.method,
      data: normalizePayload(payload),
      params: options.queryParams && normalizeJson(options.queryParams),
      withCredentials
    };

    const { data } = await sendWithRetry(
      () => axios<T>(options.url, request),
      resolveRetry(options.retry)
    );

    return data;
  } catch (err: any) {
    throw refactorError(err);
  }
}

export class HttpError<T> extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly response: T
  ) {
    super(message);
  }
}

export function config(config: Partial<LiomazeConfiguration>): void {
  if ('catchError' in config) {
    configuration.catchError = config.catchError;
  }

  if ('headers' in config) {
    configuration.headers = config.headers;
  }

  if ('withCredentials' in config) {
    configuration.withCredentials = config.withCredentials;
  }

  if ('retry' in config) {
    configuration.retry = config.retry;
  }

  if (config.interceptors) {
    configuration.interceptors = config.interceptors;
  }
}

export function interceptor(resolver: BuilderInterceptors): void {
  configuration.interceptors.push(resolver);
}

type GetOptions = Omit<HttpOptions, 'payload'>;

export function get<T = any>(
  url: string,
  options: GetOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Get, url, ...options });
}

export function post<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Post, url, ...options });
}

export function put<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Put, url, ...options });
}

export function destroy<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Delete, url, ...options });
}

export function patch<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Patch, url, ...options });
}

export function options<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: HttpMethod.Options, url, ...options });
}

export function file<T = any>(url: string, options: FileOptions): Promise<T> {
  return dispatch({
    method: HttpMethod.Post,
    url,
    headers: options.headers,
    payload: options.payload,
    retry: options.retry,
    withCredentials: options.withCredentials
  });
}
