import { normalizeJson } from '@rolster/commons';
import { HttpPayload } from './types';

function payloadIsJson(value?: HttpPayload): value is LiteralObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function mergePayload(
  interceptorPayload?: HttpPayload,
  requestPayload?: HttpPayload
): Undefined<HttpPayload> {
  return payloadIsJson(interceptorPayload) && payloadIsJson(requestPayload)
    ? { ...requestPayload, ...interceptorPayload }
    : (interceptorPayload ?? requestPayload);
}

export function normalizePayload(
  payload?: HttpPayload
): Undefined<HttpPayload> {
  return payloadIsJson(payload) ? normalizeJson(payload) : payload;
}

export function delay(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
