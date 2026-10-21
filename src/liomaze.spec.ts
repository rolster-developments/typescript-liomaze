import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Interceptor } from './interceptors';
import {
  config,
  destroy,
  download,
  file,
  get,
  HttpCancelError,
  HttpError,
  interceptor,
  options,
  patch,
  post,
  put
} from './liomaze';

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
  fn.isCancel = (err: any) => err?.name === 'CanceledError';

  return { default: fn };
});

const axiosMock = vi.mocked(axios as unknown as (...args: any[]) => any);

function axiosResponse<T>(data: T, status = 200): any {
  return { data, status, statusText: 'OK' };
}

function axiosError(status: number, data: any): any {
  return {
    isAxiosError: true,
    config: {},
    response: { status, statusText: 'ERROR', data }
  };
}

function axiosCancel(): any {
  return { isAxiosError: true, name: 'CanceledError', config: {} };
}

describe('liomaze', () => {
  beforeEach(() => {
    axiosMock.mockReset();
    config({
      retry: undefined,
      withCredentials: undefined,
      catchError: undefined,
      interceptors: []
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

      const [request] = axiosMock.mock.calls[0];
      expect(request.params).toEqual({ search: 'a b' });
    });
  });

  describe('withCredentials', () => {
    it('should use the global value by default', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      config({ withCredentials: true });

      await get('https://api.test/profile');

      expect(axiosMock.mock.calls[0][0].withCredentials).toBe(true);
    });

    it('should override the global value per request', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      config({ withCredentials: true });

      await get('https://api.test/profile', { withCredentials: false });

      expect(axiosMock.mock.calls[0][0].withCredentials).toBe(false);
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

  describe('cancel', () => {
    it('should pass the signal to axios', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      const controller = new AbortController();

      await get('https://api.test/users', { signal: controller.signal });

      expect(axiosMock.mock.calls[0][0].signal).toBe(controller.signal);
    });

    it('should expose the signal to interceptors', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));
      const controller = new AbortController();
      let received: Undefined<AbortSignal>;

      interceptor((request, next) => {
        received = request.signal;

        return next(request);
      });

      await get('https://api.test/users', { signal: controller.signal });

      expect(received).toBe(controller.signal);
    });

    it('should reject without sending when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        get('https://api.test/users', { signal: controller.signal })
      ).rejects.toBeInstanceOf(HttpCancelError);

      expect(axiosMock).not.toHaveBeenCalled();
    });

    it('should map an axios cancellation to HttpCancelError', async () => {
      const controller = new AbortController();
      const reason = new Error('user left the page');

      axiosMock.mockImplementation(() => {
        controller.abort(reason);

        return Promise.reject(axiosCancel());
      });

      try {
        await get('https://api.test/users', { signal: controller.signal });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpCancelError);
        expect((err as HttpCancelError).reason).toBe(reason);
      }
    });

    it('should not retry a canceled request', async () => {
      const controller = new AbortController();

      axiosMock.mockImplementation(() => {
        controller.abort();

        return Promise.reject(axiosCancel());
      });

      config({ retry: { attempts: 3 } });

      await expect(
        get('https://api.test/users', { signal: controller.signal })
      ).rejects.toBeInstanceOf(HttpCancelError);

      expect(axiosMock).toHaveBeenCalledTimes(1);
    });

    it('should abort while waiting for the retry delay', async () => {
      const controller = new AbortController();

      axiosMock.mockImplementation(() => {
        setTimeout(() => controller.abort(), 0);

        return Promise.reject(axiosError(503, {}));
      });

      config({ retry: { attempts: 3, delay: 60_000 } });

      await expect(
        get('https://api.test/users', { signal: controller.signal })
      ).rejects.toBeInstanceOf(HttpCancelError);

      expect(axiosMock).toHaveBeenCalledTimes(1);
    });

    it('should apply the global catchError transform to cancellations', async () => {
      const controller = new AbortController();
      controller.abort();

      config({ catchError: (error) => new Error(`wrapped: ${error.name}`) });

      await expect(
        get('https://api.test/users', { signal: controller.signal })
      ).rejects.toThrow('wrapped: HttpCancelError');
    });

    it.each([
      {
        name: 'file',
        run: (signal: AbortSignal) =>
          file('https://api.test/upload', { payload: new FormData(), signal })
      },
      {
        name: 'download',
        run: (signal: AbortSignal) =>
          download('https://api.test/file', { signal })
      }
    ])('should forward the signal from $name', async ({ run }) => {
      axiosMock.mockResolvedValue(axiosResponse(new Blob()));
      const controller = new AbortController();

      await run(controller.signal);

      expect(axiosMock.mock.calls[0][0].signal).toBe(controller.signal);
    });
  });

  describe('config', () => {
    it('should not wipe previous values on a partial update', async () => {
      axiosMock.mockResolvedValue(axiosResponse({}));

      config({ withCredentials: true });
      config({ retry: { attempts: 1 } });

      await get('https://api.test/profile');

      expect(axiosMock.mock.calls[0][0].withCredentials).toBe(true);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      { name: 'post', fn: post, expectedMethod: 'POST' },
      { name: 'put', fn: put, expectedMethod: 'PUT' },
      { name: 'patch', fn: patch, expectedMethod: 'PATCH' },
      { name: 'delete', fn: destroy, expectedMethod: 'DELETE' },
      { name: 'options', fn: options, expectedMethod: 'OPTIONS' }
    ])('should send a $name request', async ({ fn, expectedMethod }) => {
      axiosMock.mockResolvedValue(axiosResponse({ ok: true }));

      const result = await fn('https://api.test/resource');

      expect(result).toEqual({ ok: true });
      expect(axiosMock.mock.calls[0][0].method).toBe(expectedMethod);
    });
  });

  describe('download', () => {
    it('should request a blob with GET method', async () => {
      const blob = new Blob(['content'], { type: 'text/plain' });
      axiosMock.mockResolvedValue(axiosResponse(blob));

      const result = await download('https://api.test/file.pdf');

      expect(result).toBeInstanceOf(Blob);
      expect(axiosMock.mock.calls[0][0].method).toBe('GET');
      expect(axiosMock.mock.calls[0][0].responseType).toBe('blob');
    });

    it('should pass query params to the request', async () => {
      axiosMock.mockResolvedValue(axiosResponse(new Blob()));

      await download('https://api.test/file', {
        queryParams: { id: '123' }
      });

      expect(axiosMock.mock.calls[0][0].params).toEqual({ id: '123' });
    });
  });

  describe('interceptor', () => {
    beforeEach(() => {
      axiosMock.mockResolvedValue(axiosResponse({}));
    });

    it('should modify headers via interceptor', async () => {
      const customInterceptor: Interceptor = async (request, next) =>
        next({
          ...request,
          headers: { ...request.headers, 'X-Angular': 'yes' }
        });

      interceptor(customInterceptor);

      await get('https://api.test/resource');

      expect(axiosMock.mock.calls[0][0].headers['X-Angular']).toBe('yes');
    });

    it('should transform the response via interceptor', async () => {
      axiosMock.mockResolvedValue(axiosResponse({ original: true }));

      const transformer: Interceptor = async (request, next) => {
        const response = await next(request);

        return { ...response, data: { transformed: true } };
      };

      interceptor(transformer);

      const result = await get('https://api.test/resource');

      expect(result).toEqual({ transformed: true });
    });

    it('should allow retry via interceptor', async () => {
      axiosMock
        .mockRejectedValueOnce(axiosError(503, {}))
        .mockResolvedValueOnce(axiosResponse({ ok: true }));

      const retrier: Interceptor = async (request, next) => {
        try {
          return await next(request);
        } catch {
          return next(request);
        }
      };

      interceptor(retrier);

      const result = await get('https://api.test/flaky');

      expect(result).toEqual({ ok: true });
      expect(axiosMock).toHaveBeenCalledTimes(2);
    });

    it('should run multiple interceptors in order', async () => {
      const order: number[] = [];

      const first: Interceptor = async (request, next) => {
        order.push(1);
        const response = await next(request);
        order.push(4);
        return response;
      };

      const second: Interceptor = async (request, next) => {
        order.push(2);
        const response = await next(request);
        order.push(3);
        return response;
      };

      interceptor(first);
      interceptor(second);

      await get('https://api.test/resource');

      expect(order).toEqual([1, 2, 3, 4]);
    });
  });

  describe('file', () => {
    it('should send the FormData payload untouched', async () => {
      axiosMock.mockResolvedValue(axiosResponse({ uploaded: true }));

      const form = new FormData();
      form.append('field', 'value');

      const result = await file('https://api.test/upload', { payload: form });

      expect(result).toEqual({ uploaded: true });
      expect(axiosMock.mock.calls[0][0].data).toBe(form);
    });
  });
});
