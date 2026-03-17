import { fromPromise, normalizeJson } from '@rolster/commons';
import axios from 'axios';

export enum Method {
  Post = 'POST',
  Get = 'GET',
  Put = 'PUT',
  Delete = 'DELETE',
  Patch = 'PATCH',
  Options = 'OPTIONS'
}

interface HttpOptions {
  headers?: LiteralObject;
  payload?: LiteralObject;
  queryParams?: LiteralObject;
}

interface FileOptions {
  headers?: LiteralObject;
  payload?: FormData;
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

function createUrl(baseUrl: string, queryParams?: LiteralObject): string {
  if (!queryParams) {
    return baseUrl;
  }

  const paramsUrl = Object.entries(queryParams)
    .reduce<string[]>((params, [key, value]) => {
      params.push(`${key}=${value}`);

      return params;
    }, [])
    .join('&');

  return `${baseUrl}?${paramsUrl}`;
}

async function request<T = any>(
  method: Method,
  url: string,
  options: HttpOptions
): Promise<T> {
  try {
    const { headers, payload } = await refactorRequest({
      method,
      url,
      headers: options.headers,
      payload: options.payload
    });

    const response = await axios<T>(
      createUrl(url, options.queryParams && normalizeJson(options.queryParams)),
      {
        headers,
        method,
        data: payload && normalizeJson(payload)
      }
    );

    const { data, status, statusText } = response;

    if (status < 200 || status >= 300) {
      throw new HttpError(status, statusText, data);
    }

    return data;
  } catch (err: any) {
    throw configuration.catchError ? configuration.catchError(err) : err;
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
  configuration.catchError = config.catchError;
  configuration.headers = config.headers;

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
  return request(Method.Get, url, options);
}

export function post<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return request(Method.Post, url, options);
}

export function put<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return request(Method.Put, url, options);
}

export function destroy<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return request(Method.Delete, url, options);
}

export function patch<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return request(Method.Patch, url, options);
}

export function options<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  return request(Method.Options, url, options);
}

export async function file<T = any>(
  url: string,
  options: FileOptions
): Promise<T> {
  try {
    const { headers } = await refactorRequest({
      method: Method.Post,
      url,
      headers: options.headers
    });

    const response = await axios<T>(createUrl(url), {
      headers,
      method: Method.Post,
      data: options.payload
    });

    const { data, status, statusText } = response;

    if (status < 200 || status >= 300) {
      throw new HttpError(status, statusText, data);
    }

    return data;
  } catch (err: any) {
    throw configuration.catchError?.(err) || err;
  }
}
