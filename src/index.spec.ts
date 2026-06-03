import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, config, file, get } from './index';

vi.mock('@rolster/commons', () => ({
  fromPromise: (value: any) => Promise.resolve(value),
  delayPromise: (value: () => any) => Promise.resolve(value()),
  normalizeJson: (payload: LiteralObject) =>
    Object.entries(payload).reduce<LiteralObject>((json, [key, value]) => {
      if (value !== undefined && value !== null) {
        json[key] = value;
      }

      return json;
    }, {})
}));

vi.mock('axios', () => {
  const fn: any = vi.fn();
  fn.isAxiosError = (err: any) => Boolean(err?.isAxiosError);

  return { default: fn };
});

const axiosMock = vi.mocked(axios as unknown as (...args: any[]) => any);

function axiosResponse<T>(data: T, status = 200): any {
  return { data, status, statusText: 'OK' };
}

function axiosError(status: number, data: any): any {
  return {
    isAxiosError: true,
    response: { status, statusText: 'ERROR', data }
  };
}

describe('liomaze', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    config({
      retry: undefined,
      withCredentials: undefined,
      catchError: undefined
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requests', () => {
    it('should return the response data', async () => {
      axiosMock.mockResolvedValue(axiosResponse({ id: 1 }));

      const result = await get('https://api.test/users/1');

      expect(result).toEqual({ id: 1 });
      expect(axiosMock).toHaveBeenCalledTimes(1);
    });

    it('should normalize query params into axios params', async () => {
      axiosMock.mockResolvedValue(axiosResponse([]));

      await get('https://api.test/users', {
        queryParams: { search: 'a b', empty: undefined }
      });

      const [, request] = axiosMock.mock.calls[0];
      expect(request.params).toEqual({ search: 'a b' });
    });
  });

  describe('withCredentials', () => {
    it('should use the global value by default', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      config({ withCredentials: true });

      await get('https://api.test/profile');

      expect(axiosMock.mock.calls[0][1].withCredentials).toBe(true);
    });

    it('should override the global value per request', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      config({ withCredentials: true });

      await get('https://api.test/profile', { withCredentials: false });

      expect(axiosMock.mock.calls[0][1].withCredentials).toBe(false);
    });
  });

  describe('retry', () => {
    it('should retry until the request succeeds', async () => {
      axiosMock
        .mockRejectedValueOnce(axiosError(503, {}))
        .mockRejectedValueOnce(axiosError(503, {}))
        .mockResolvedValueOnce(axiosResponse({ ok: true }));

      config({ retry: { attempts: 3 } });

      const result = await get('https://api.test/flaky');

      expect(result).toEqual({ ok: true });
      expect(axiosMock).toHaveBeenCalledTimes(3);
    });

    it('should give up after exhausting the attempts', async () => {
      axiosMock.mockRejectedValue(axiosError(503, { message: 'down' }));
      config({ retry: { attempts: 2 } });

      await expect(get('https://api.test/flaky')).rejects.toBeInstanceOf(
        HttpError
      );

      expect(axiosMock).toHaveBeenCalledTimes(3);
    });

    it('should allow disabling retry per request', async () => {
      axiosMock.mockRejectedValue(axiosError(503, {}));
      config({ retry: { attempts: 3 } });

      await expect(
        get('https://api.test/flaky', { retry: false })
      ).rejects.toBeInstanceOf(HttpError);

      expect(axiosMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('should map an axios error to HttpError', async () => {
      axiosMock.mockRejectedValue(axiosError(404, { message: 'not found' }));

      try {
        await get('https://api.test/missing');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError<any>).statusCode).toBe(404);
        expect((err as HttpError<any>).response).toEqual({
          message: 'not found'
        });
      }
    });

    it('should apply the global catchError transform', async () => {
      axiosMock.mockRejectedValue(axiosError(500, {}));
      config({ catchError: () => new Error('custom') });

      await expect(get('https://api.test/error')).rejects.toThrow('custom');
    });
  });

  describe('config', () => {
    it('should not wipe previous values on a partial update', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));

      config({ withCredentials: true });
      config({ retry: { attempts: 1 } });

      await get('https://api.test/profile');

      expect(axiosMock.mock.calls[0][1].withCredentials).toBe(true);
    });
  });

  describe('file', () => {
    it('should send the FormData payload untouched', async () => {
      axiosMock.mockResolvedValue(axiosResponse({ uploaded: true }));

      const form = new FormData();
      form.append('field', 'value');

      const result = await file('https://api.test/upload', { payload: form });

      expect(result).toEqual({ uploaded: true });
      expect(axiosMock.mock.calls[0][1].data).toBe(form);
    });
  });
});
