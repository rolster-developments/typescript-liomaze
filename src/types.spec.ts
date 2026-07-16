import { describe, expect, it } from 'vitest';

import { HttpMethod } from './types';

describe('HttpMethod', () => {
  it('should have correct HTTP method values', () => {
    expect(HttpMethod.Post).toBe('POST');
    expect(HttpMethod.Get).toBe('GET');
    expect(HttpMethod.Put).toBe('PUT');
    expect(HttpMethod.Delete).toBe('DELETE');
    expect(HttpMethod.Patch).toBe('PATCH');
    expect(HttpMethod.Options).toBe('OPTIONS');
  });
});
