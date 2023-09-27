import { fromPromise } from '@rolster/helpers-advanced';

type Json = Record<string, any>;

enum Method {
  Post = 'POST',
  Get = 'GET',
  Put = 'PUT',
  Delete = 'DELETE',
  Patch = 'PATCH',
  Options = 'OPTIONS'
}

interface Options {
  url: string;
  body?: Json;
  headers?: Json;
  queryParams?: Json;
}

type Result = void | Promise<void>;
type Header = (key: string, value: any) => Result;

interface ResolveHeader {
  url: string;
  header: Header;
}

interface ResolveInterceptor {
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
  url: string;
  body?: Json;
  headers?: Json;
}

interface RefactorResult {
  body: Json;
  headers: Json;
}

class Interceptor {
  private readonly headersJson: Json = {};

  private readonly bodyJson: Json = {};

  public header<T>(key: string, value: T): void {
    this.headersJson[key] = String(value);
  }

  public body<T>(key: string, value: T): void {
    this.bodyJson[key] = value;
  }

  public build(globals: Json, headers?: Json, body?: Json): RefactorResult {
    return {
      headers: { ...globals, ...this.headersJson, ...headers },
      body: { ...this.bodyJson, ...body }
    };
  }
}

const configuration: Configuration = {
  interceptors: []
};

async function refactorHeaders(url: string): Promise<Json> {
  const { headers } = configuration;

  const resultHeaders: Json = {};

  if (headers) {
    await fromPromise(
      headers({
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
  const { url, body, headers } = options;
  const { interceptors } = configuration;

  const interceptor = new Interceptor();

  await Promise.all(
    interceptors.map((resolver) => fromPromise(resolver({ url, interceptor })))
  );

  return interceptor.build(refactorHeaders(url), headers, body);
}

function createUrl(baseUrl: string, queryParams?: Json): string {
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

function request<T = unknown>(method: Method, props: Options): Promise<T> {
  const { url, body, headers, queryParams } = props;

  return refactorRequest({ url, body, headers }).then(({ body, headers }) =>
    fetch(createUrl(url, queryParams), {
      headers,
      method,
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        const { status, statusText } = response;

        if (status < 200 || status >= 300) {
          throw new HttpError(status, statusText, await response.json());
        }

        return response.json() as T;
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

export function get<T = unknown>(options: Options): Promise<T> {
  return request(Method.Get, options);
}

export function post<T = unknown>(options: Options): Promise<T> {
  return request(Method.Post, options);
}

export function put<T = unknown>(options: Options): Promise<T> {
  return request(Method.Put, options);
}

export function destroy<T = unknown>(options: Options): Promise<T> {
  return request(Method.Delete, options);
}

export function patch<T = unknown>(options: Options): Promise<T> {
  return request(Method.Patch, options);
}

export function options<T = unknown>(options: Options): Promise<T> {
  return request(Method.Options, options);
}
