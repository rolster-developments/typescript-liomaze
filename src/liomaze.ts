import { delayPromise, normalizeJson } from '@rolster/commons';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { normalizePayload } from './helpers';
import {
  BuilderInterceptors,
  buildPipeline,
  InterceptorRequest,
  LiomazeInterceptor,
  normalizeInterceptor
} from './interceptors';
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
  method?: HttpMethod;
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

type BuilderHeaders = (options: BuilderHeadersOptions) => Result;

interface LiomazeConfiguration {
  interceptors: LiomazeInterceptor[];
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
  retry?: HttpRetry | false;
  withCredentials?: boolean;
}

const configuration: LiomazeConfiguration = {
  interceptors: []
};

function createContextConfiguration(): LiomazeConfiguration {
  return {
    catchError: configuration.catchError,
    headers: configuration.headers,
    interceptors: [...configuration.interceptors],
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

function refactorError(context: LiomazeConfiguration, err: any): Error {
  const error =
    axios.isAxiosError(err) && err.response
      ? new HttpError(
          err.response.status,
          err.response.statusText,
          err.response.data
        )
      : err;

  return context.catchError ? context.catchError(error) : error;
}

async function dispatch<T>(options: DispatchOptions): Promise<T> {
  const context = createContextConfiguration();

  const headers = await createHeaders(context, options.method, options.url);

  const initialRequest: InterceptorRequest = {
    method: options.method,
    url: options.url,
    headers: { ...headers, ...options.headers },
    data: options.payload,
    params: options.queryParams && normalizeJson(options.queryParams),
    withCredentials: options.withCredentials ?? context.withCredentials
  };

  const pipeline = buildPipeline(context.interceptors, (req) => {
    const axiosConfig: AxiosRequestConfig = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      data: normalizePayload(req.data),
      params: req.params,
      withCredentials: req.withCredentials
    };

    return axios(axiosConfig);
  });

  try {
    const response = await sendWithRetry<AxiosResponse>(
      () => pipeline(initialRequest),
      resolveRetry(context, options.retry)
    );

    return response.data;
  } catch (err: any) {
    throw refactorError(context, err);
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

export function config(
  config: Partial<LiomazeConfiguration> & {
    interceptors?: (BuilderInterceptors | LiomazeInterceptor)[];
  }
): void {
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
    configuration.interceptors = config.interceptors.map(normalizeInterceptor);
  }
}

export function interceptor(
  resolver: BuilderInterceptors | LiomazeInterceptor
): void {
  configuration.interceptors.push(normalizeInterceptor(resolver));
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
    withCredentials: options.withCredentials
  });
}
