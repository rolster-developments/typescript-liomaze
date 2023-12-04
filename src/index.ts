import { fromPromise } from '@rolster/helpers-advanced';

export enum Method {
  Post = 'POST',
  Get = 'GET',
  Put = 'PUT',
  Delete = 'DELETE',
  Patch = 'PATCH',
  Options = 'OPTIONS'
}

interface Options {
  headers?: LiteralObject<any>;
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

interface Refactor {
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
  private readonly headersJson: LiteralObject = {};

  private payloadJson?: LiteralObject;

  public header<T>(key: string, value: T): void {
    this.headersJson[key] = String(value);
  }

  public payload<T>(key: string, value: T): void {
    if (!this.payloadJson) {
      this.payloadJson = {};
    }

    this.payloadJson[key] = value;
  }

  public build(
    globals: LiteralObject,
    headers?: LiteralObject<any>,
    payload?: LiteralObject
  ): RefactorResult {
    return {
      headers: { ...globals, ...this.headersJson, ...headers },
      payload: (this.payloadJson || payload) && {
        ...this.payloadJson,
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
  const { headers } = configuration;

  const resultHeaders: LiteralObject = {};

  if (headers) {
    await fromPromise(
      headers({
        method,
        url,
        header: (key: string, value: any) => {
          resultHeaders[key] = value;
        }
      })
    );
  }

  return resultHeaders;
}

async function refactorRequest(options: Refactor): Promise<RefactorResult> {
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

function request<T = unknown>(
  method: Method,
  url: string,
  options: Options
): Promise<T> {
  const { headers, payload, queryParams } = options;

  return refactorRequest({ method, url, headers, payload }).then(
    ({ headers, payload }) =>
      fetch(createUrl(url, queryParams), {
        headers,
        method,
        body: payload && JSON.stringify(payload)
      })
        .then(async (response) => {
          const { status, statusText } = response;

          if (status < 200 || status >= 300) {
            throw new HttpError(status, statusText, await response.json());
          }

          const contentTypeHeader = response.headers
            .get('Content-Type')
            ?.split(';');

          const contentType = contentTypeHeader
            ? contentTypeHeader[0]
            : 'text/plain';

          switch (contentType) {
            case 'application/octet-stream':
              return response.blob();
            case 'application/json':
              return response.json().catch(() => ({}));
            default:
              return response.text();
          }
        })
        .catch((error) => {
          const { catchError } = configuration;

          throw catchError ? catchError(error) : error;
        })
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

type GetOptions = Omit<Options, 'payload'>;

export function get<T = unknown>(
  url: string,
  options: GetOptions = {}
): Promise<T> {
  return request(Method.Get, url, options);
}

export function post<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  return request(Method.Post, url, options);
}

export function put<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  return request(Method.Put, url, options);
}

export function destroy<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  return request(Method.Delete, url, options);
}

export function patch<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  return request(Method.Patch, url, options);
}

export function options<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  return request(Method.Options, url, options);
}
