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

interface RequestProps {
  url: string;
  body?: Json;
  headers?: Json;
  queryParams?: Json;
}

type Result = void | Promise<void>;
type Header = (key: string, value: any) => Result;

interface Headers {
  url: string;
  header: Header;
}

type ResolveHeaders = (headers: Headers) => Result;

interface Configuration {
  interceptors: ResolveHeaders[];
  catchError?: (error: Error) => Error;
  headers?: ResolveHeaders;
}

const configuration: Configuration = {
  interceptors: []
};

async function createHeaders(url: string, headers?: Json): Promise<Json> {
  const { interceptors, headers: globalHeaders } = configuration;

  const request: Json = {};

  const header = (key: string, value: any) => {
    request[key] = value;
  };

  if (globalHeaders) {
    await fromPromise(globalHeaders({ url, header }));
  }

  if (interceptors) {
    await Promise.all(
      interceptors.map((interceptor) =>
        fromPromise(interceptor({ url, header }))
      )
    );
  }

  return { ...request, ...headers };
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

function request<T = unknown>(method: Method, props: RequestProps): Promise<T> {
  const { url, body, headers, queryParams } = props;

  return createHeaders(url, headers).then((headers) =>
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

export function interceptor(resolver: ResolveHeaders): void {
  configuration.interceptors.push(resolver);
}

export function get<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Get, props);
}

export function post<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Post, props);
}

export function put<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Put, props);
}

export function destroy<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Delete, props);
}

export function patch<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Patch, props);
}

export function options<T = unknown>(props: RequestProps): Promise<T> {
  return request(Method.Options, props);
}
