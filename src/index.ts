import { fromPromise, itIsDefined } from '@rolster/commons';
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
  const { headers: configHeaders } = configuration;

  const headers: LiteralObject = {};

  if (configHeaders) {
    await fromPromise(
      configHeaders({
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

async function refactorRequest(
  options: RefactorOptions
): Promise<RefactorResult> {
  const { method, url, payload, headers } = options;
  const { interceptors } = configuration;

  const resultHeaders = await refactorHeaders(method, url);

  const interceptor = new Interceptor();

  await Promise.all(
    interceptors.map((resolver) =>
      fromPromise(resolver({ method, url, interceptor }))
    )
  );

  return interceptor.build(resultHeaders, headers, payload);
}

function normalizeJson(payload: LiteralObject): LiteralObject {
  return Object.entries(payload).reduce(
    (result: LiteralObject, [key, value]) => {
      if (itIsDefined(value)) {
        result[key] =
          typeof value === 'object'
            ? Array.isArray(value)
              ? value.map((value) => normalizeJson(value))
              : normalizeJson(value)
            : value;
      }

      return result;
    },
    {}
  );
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

function request<T = any>(
  method: Method,
  url: string,
  options: HttpOptions
): Promise<T> {
  const { headers, payload, queryParams } = options;

  return refactorRequest({ method, url, headers, payload }).then(
    ({ headers, payload }) => {
      return axios<T>(
        createUrl(url, queryParams && normalizeJson(queryParams)),
        {
          headers,
          method,
          data: payload && normalizeJson(payload)
        }
      )
        .then((response) => {
          const { data, status, statusText } = response;

          if (status < 200 || status >= 300) {
            throw new HttpError(status, statusText, data);
          }

          return data;
        })
        .catch((error) => {
          const { catchError } = configuration;

          throw catchError ? catchError(error) : error;
        });
    }
  );
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
  const { catchError, headers, interceptors } = config;

  configuration.catchError = catchError;
  configuration.headers = headers;

  if (interceptors) {
    configuration.interceptors = interceptors;
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
