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

export function normalizePayload(payload?: HttpPayload): Undefined<HttpPayload> {
  return payloadIsJson(payload) ? normalizeJson(payload) : payload;
}
