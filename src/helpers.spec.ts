import { describe, expect, it } from 'vitest';

import { mergePayload, normalizePayload } from './helpers';

describe('mergePayload', () => {
  it('should merge two JSON objects, with interceptor overriding request', () => {
    const result = mergePayload({ b: 2, c: 3 }, { a: 1, b: 99 });

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('should return interceptor payload when request payload is not JSON', () => {
    const result = mergePayload('interceptor', { a: 1 });

    expect(result).toBe('interceptor');
  });

  it('should return interceptor payload when request payload is undefined', () => {
    const result = mergePayload({ a: 1 }, undefined);

    expect(result).toEqual({ a: 1 });
  });

  it('should return request payload when interceptor payload is undefined', () => {
    const result = mergePayload(undefined, { b: 2 });

    expect(result).toEqual({ b: 2 });
  });

  it('should return undefined when both payloads are undefined', () => {
    const result = mergePayload(undefined, undefined);

    expect(result).toBeUndefined();
  });

  it('should return the interceptor payload when interceptor is not JSON and request is undefined', () => {
    const result = mergePayload('text', undefined);

    expect(result).toBe('text');
  });

  it('should prefer interceptor over request when both are non-JSON', () => {
    const result = mergePayload('interceptor', 'request');

    expect(result).toBe('interceptor');
  });
});

describe('normalizePayload', () => {
  it('should normalize JSON payload removing undefined values', () => {
    const result = normalizePayload({ a: 1, b: undefined, c: null });

    expect(result).toEqual({ a: 1 });
  });

  it('should return non-JSON payload as-is', () => {
    const form = new FormData();

    expect(normalizePayload(form)).toBe(form);
  });

  it('should return undefined for undefined payload', () => {
    expect(normalizePayload(undefined)).toBeUndefined();
  });

  it('should return array payload as-is', () => {
    const arr = [1, 2, 3];

    expect(normalizePayload(arr)).toBe(arr);
  });
});
