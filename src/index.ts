import { delayPromise, fromPromise, normalizeJson } from '@rolster/commons';
import axios, { AxiosRequestConfig } from 'axios';

export enum Method {
  Post = 'POST',
  Get = 'GET',
  Put = 'PUT',
  Delete = 'DELETE',
  Patch = 'PATCH',
  Options = 'OPTIONS'
}

export interface RetryConfig {
  attempts: number;
  delay?: number;
}

interface HttpOptions {
  headers?: LiteralObject;
  payload?: LiteralObject;
  queryParams?: LiteralObject;
  withCredentials?: boolean;
  retry?: RetryConfig | false;
}

interface FileOptions {
  headers?: LiteralObject;
  payload?: FormData;
  withCredentials?: boolean;
  retry?: RetryConfig | false;
}

type Result = void | Promise<void>;
type Header = (key: string, value: any) => Result;

interface ResolveHeader {
  method: Method;
  url: string;
  header: Header;
}

interface ResolveInterceptor {
  method: Method;
  url: string;
  interceptor: Interceptor;
}

type ResolverHeader = (resolve: ResolveHeader) => Result;
type ResolverInterceptor = (resolve: ResolveInterceptor) => Result;

interface Configuration {
  interceptors: ResolverInterceptor[];
  catchError?: (error: Error) => Error;
  headers?: ResolverHeader;
  withCredentials?: boolean;
  retry?: RetryConfig;
}

interface RefactorOptions {
  method: Method;
  url: string;
  headers?: LiteralObject;
  payload?: LiteralObject;
}

interface RefactorResult {
  headers: LiteralObject<any>;
  payload?: LiteralObject;
}

interface DispatchOptions {
  method: Method;
  url: string;
  headers?: LiteralObject;
  payload?: LiteralObject;
  data?: any;
  queryParams?: LiteralObject;
  withCredentials?: boolean;
  retry?: RetryConfig | false;
}

class Interceptor {
  private readonly headers: LiteralObject = {};

  private body?: LiteralObject;

  public header<T>(key: string, value: T): void {
    this.headers[key] = String(value);
  }

  public payload<T>(key: string, value: T): void {
    if (!this.body) {
      this.body = {};
    }

    this.body[key] = value;
  }

  public build(
    globals: LiteralObject,
    headers?: LiteralObject<any>,
    payload?: LiteralObject
  ): RefactorResult {
    return {
      headers: { ...globals, ...this.headers, ...headers },
      payload: (this.body || payload) && {
        ...this.body,
        ...payload
      }
    };
  }
}

const configuration: Configuration = {
  interceptors: []
};

async function refactorHeaders(
  method: Method,
  url: string
): Promise<LiteralObject> {
  const headers: LiteralObject = {};

  configuration.headers &&
    (await fromPromise(
      configuration.headers({
        method,
        url,
        header: (key: string, value: any) => {
          headers[key] = value;
        }
      })
    ));

  return headers;
}

async function refactorRequest(
  options: RefactorOptions
): Promise<RefactorResult> {
  const headers = await refactorHeaders(options.method, options.url);

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

function resolveRetry(local?: RetryConfig | false): Undefined<RetryConfig> {
  if (local === false) {
    return undefined;
  }

  return local ?? configuration.retry;
}

async function sendWithRetry<T>(
  send: () => Promise<T>,
  retry?: RetryConfig
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await send();
    } catch (err) {
      if (retry && attempt < retry.attempts) {
        attempt++;

        if (retry.delay) {
          await delayPromise(() => undefined, retry.delay);
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
    const { headers, payload } = await refactorRequest({
      method: options.method,
      url: options.url,
      headers: options.headers,
      payload: options.payload
    });

    const request: AxiosRequestConfig = {
      headers,
      method: options.method,
      data: options.data ?? (payload && normalizeJson(payload)),
      params: options.queryParams && normalizeJson(options.queryParams),
      withCredentials: options.withCredentials ?? configuration.withCredentials
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

export function config(config: Partial<Configuration>): void {
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

export function interceptor(resolver: ResolverInterceptor): void {
  configuration.interceptors.push(resolver);
}

type GetOptions = Omit<HttpOptions, 'payload'>;

export function get<T = any>(
  url: string,
  options: GetOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Get, url, ...options });
}

export function post<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Post, url, ...options });
}

export function put<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Put, url, ...options });
}

export function destroy<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Delete, url, ...options });
}

export function patch<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Patch, url, ...options });
}

export function options<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return dispatch({ method: Method.Options, url, ...options });
}

export function file<T = any>(url: string, options: FileOptions): Promise<T> {
  return dispatch({
    method: Method.Post,
    url,
    headers: options.headers,
    data: options.payload,
    withCredentials: options.withCredentials,
    retry: options.retry
  });
}
