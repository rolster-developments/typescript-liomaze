import { normalizeJson } from '@rolster/commons';
import axios, { AxiosRequestConfig, AxiosResponse, ResponseType } from 'axios';
import { delay, normalizePayload } from './helpers';
import { buildPipeline, Interceptor, InterceptorRequest } from './interceptors';
import { HttpMethod, HttpPayload, HttpRetry } from './types';

interface HttpOptions {
  headers?: LiteralObject;
  payload?: HttpPayload;
  queryParams?: LiteralObject;
  retry?: HttpRetry | false;
  signal?: AbortSignal;
  withCredentials?: boolean;
}

type FileOptions = HttpOptions & { method?: HttpMethod };
type DownloadOption = HttpOptions & { method?: HttpMethod };

type Result = void | Promise<void>;
type BuilderHeader = (key: string, value: any) => Result;

interface BuilderHeadersOptions {
  header: BuilderHeader;
  method: HttpMethod;
  url: string;
}

type BuilderHeaders = (options: BuilderHeadersOptions) => Result;

interface LiomazeConfiguration {
  interceptors: Interceptor[];
  responseType: ResponseType;
  catchError?: (error: Error) => Error;
  headers?: BuilderHeaders;
  retry?: HttpRetry;
  withCredentials?: boolean;
}

interface DispatchOptions {
  method: HttpMethod;
  url: string;
  headers?: LiteralObject;
  payload?: HttpPayload;
  queryParams?: LiteralObject;
  responseType?: ResponseType;
  retry?: HttpRetry | false;
  signal?: AbortSignal;
  withCredentials?: boolean;
}

const configuration: LiomazeConfiguration = {
  interceptors: [],
  responseType: 'json'
};

function createContextConfiguration(): LiomazeConfiguration {
  return {
    catchError: configuration.catchError,
    headers: configuration.headers,
    interceptors: [...configuration.interceptors],
    responseType: configuration.responseType,
    retry: configuration.retry,
    withCredentials: configuration.withCredentials
  };
}

async function createHeaders(
  context: LiomazeConfiguration,
  method: HttpMethod,
  url: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (context.headers) {
    await context.headers({
      method,
      url,
      header: (key: string, value: any) => {
        headers[key] = String(value);
      }
    });
  }

  return headers;
}

function resolveRetry(
  context: LiomazeConfiguration,
  local?: HttpRetry | false
): Undefined<HttpRetry> {
  if (local === false) {
    return undefined;
  }

  return local ?? context.retry;
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

function isCanceled(err: unknown, signal?: AbortSignal): boolean {
  if (axios.isCancel(err)) {
    return true;
  }

  const hasResponse = axios.isAxiosError(err) && Boolean(err.response);

  return Boolean(signal?.aborted) && !hasResponse;
}

async function sendWithRetry<T>(
  send: () => Promise<T>,
  retry?: HttpRetry,
  signal?: AbortSignal
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await send();
    } catch (err) {
      if (isCanceled(err, signal)) {
        throw err;
      }

      if (retry && attempt < retry.attempts && shouldRetryOnError(err)) {
        attempt++;

        if (retry.delay) {
          const backoff = retry.delay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * backoff * 0.25;

          await delay(backoff + jitter, signal);
        }

        continue;
      }

      throw err;
    }
  }
}

function refactorError(
  context: LiomazeConfiguration,
  err: any,
  signal?: AbortSignal
): Error {
  let error: Error;

  if (isCanceled(err, signal)) {
    error = new HttpCancelError(signal?.reason ?? err);
  } else if (axios.isAxiosError(err) && err.response) {
    error = new HttpError(
      err.response.status,
      err.response.statusText,
      err.response.data
    );
  } else {
    error = err;
  }

  return context.catchError ? context.catchError(error) : error;
}

async function dispatch<T>(options: DispatchOptions): Promise<T> {
  const context = createContextConfiguration();

  if (options.signal?.aborted) {
    throw refactorError(context, options.signal.reason, options.signal);
  }

  const headers = await createHeaders(context, options.method, options.url);

  const initialRequest: InterceptorRequest = {
    method: options.method,
    url: options.url,
    headers: { ...headers, ...options.headers },
    data: options.payload,
    params: options.queryParams && normalizeJson(options.queryParams),
    responseType: options.responseType || context.responseType,
    signal: options.signal,
    withCredentials: options.withCredentials ?? context.withCredentials
  };

  const pipeline = buildPipeline(context.interceptors, (req) => {
    const axiosConfig: AxiosRequestConfig = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      data: normalizePayload(req.data),
      params: req.params,
      responseType: req.responseType,
      signal: req.signal,
      withCredentials: req.withCredentials
    };

    return axios(axiosConfig);
  });

  try {
    const response = await sendWithRetry<AxiosResponse>(
      () => pipeline(initialRequest),
      resolveRetry(context, options.retry),
      options.signal
    );

    return response.data;
  } catch (err: any) {
    throw refactorError(context, err, options.signal);
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

export class HttpCancelError extends Error {
  constructor(public readonly reason?: unknown) {
    super('Request was canceled');

    this.name = 'HttpCancelError';
  }
}

export function config(config: Partial<LiomazeConfiguration>): void {
  if ('catchError' in config) {
    configuration.catchError = config.catchError;
  }

  if ('headers' in config) {
    configuration.headers = config.headers;
  }

  if (config.responseType) {
    configuration.responseType = config.responseType;
  }

  if ('retry' in config) {
    configuration.retry = config.retry;
  }

  if ('withCredentials' in config) {
    configuration.withCredentials = config.withCredentials;
  }

  if (config.interceptors) {
    configuration.interceptors = config.interceptors;
  }
}

export function interceptor(resolver: Interceptor): void {
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
    method: options.method ?? HttpMethod.Post,
    url,
    headers: options.headers,
    payload: options.payload,
    retry: options.retry,
    signal: options.signal,
    withCredentials: options.withCredentials
  });
}

export function download(
  url: string,
  options: DownloadOption = {}
): Promise<Blob> {
  return dispatch<Blob>({
    method: options.method || HttpMethod.Get,
    url,
    headers: options.headers,
    payload: options.payload,
    queryParams: options.queryParams,
    responseType: 'blob',
    retry: options.retry,
    signal: options.signal,
    withCredentials: options.withCredentials
  });
}
