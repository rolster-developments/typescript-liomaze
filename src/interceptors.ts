import { AxiosResponse } from 'axios';
import { mergePayload } from './helpers';
import { HttpMethod, HttpPayload } from './types';

// === Legacy types and class (backward compatibility) ===

type Result = void | Promise<void>;

export interface BuilderInterceptorsOptions {
  interceptor: Interceptor;
  method: HttpMethod;
  url: string;
}

export type BuilderInterceptors = (
  options: BuilderInterceptorsOptions
) => Result;

export class Interceptor {
  private readonly headers: Record<string, string> = {};

  private _payload?: HttpPayload;

  public header(key: string, value: any): void {
    this.headers[key] = String(value);
  }

  public payload(payload: HttpPayload): void {
    this._payload = payload;
  }

  public build(
    globals: Record<string, string>,
    headers?: Record<string, string>,
    payload?: HttpPayload
  ) {
    return {
      headers: { ...globals, ...this.headers, ...headers },
      payload: mergePayload(this._payload, payload)
    };
  }
}

// === New pipeline API (Angular-style) ===

export interface InterceptorRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  data?: HttpPayload;
  params?: Record<string, any>;
  withCredentials?: boolean;
}

export type InterceptorNext = (
  request: InterceptorRequest
) => Promise<AxiosResponse>;

export interface LiomazeInterceptor {
  intercept(
    request: InterceptorRequest,
    next: InterceptorNext
  ): Promise<AxiosResponse>;
}

// Adapter: old-style BuilderInterceptors → LiomazeInterceptor

function isLiomazeInterceptor(
  value: any
): value is LiomazeInterceptor {
  return typeof value === 'object' && 'intercept' in value;
}

export function normalizeInterceptor(
  resolver: BuilderInterceptors | LiomazeInterceptor
): LiomazeInterceptor {
  if (isLiomazeInterceptor(resolver)) {
    return resolver;
  }

  return {
    async intercept(request, next) {
      const interceptor = new Interceptor();

      await resolver({
        interceptor,
        method: request.method,
        url: request.url
      });

      const result = interceptor.build(request.headers, {}, request.data);

      return next({
        ...request,
        headers: result.headers,
        data: result.payload
      });
    }
  };
}

// Builds a composed pipeline (innermost → outermost)

export function buildPipeline(
  interceptors: LiomazeInterceptor[],
  finalHandler: InterceptorNext
): InterceptorNext {
  let next = finalHandler;

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const current = next;
    const interceptor = interceptors[i];
    next = (req) => interceptor.intercept(req, current);
  }

  return next;
}
