import { AxiosResponse, ResponseType } from 'axios';
import { HttpMethod, HttpPayload } from './types';

export interface InterceptorRequest {
  headers: Record<string, string>;
  method: HttpMethod;
  url: string;
  data?: HttpPayload;
  params?: Record<string, any>;
  responseType?: ResponseType;
  withCredentials?: boolean;
}

export type InterceptorNext = (
  request: InterceptorRequest
) => Promise<AxiosResponse>;

export type Interceptor = (
  request: InterceptorRequest,
  next: InterceptorNext
) => Promise<AxiosResponse>;

export function buildPipeline(
  interceptors: Interceptor[],
  finalHandler: InterceptorNext
): InterceptorNext {
  let next = finalHandler;

  for (let i = interceptors.length - 1; i >= 0; i--) {
    const current = next;
    const interceptor = interceptors[i];
    next = (req) => interceptor(req, current);
  }

  return next;
}
