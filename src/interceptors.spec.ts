import { describe, expect, it, vi } from 'vitest';

import { buildPipeline, Interceptor } from './interceptors';

describe('buildPipeline', () => {
  it('should call the final handler when no interceptors', async () => {
    const handler = vi.fn().mockResolvedValue('done');
    const pipeline = buildPipeline([], handler);

    const result = await pipeline({} as any);

    expect(result).toBe('done');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should wrap a single interceptor around the final handler', async () => {
    const handler = vi.fn().mockResolvedValue('done');

    const interceptor: Interceptor = vi.fn(async (req, next) => {
      return next(req);
    });

    const pipeline = buildPipeline([interceptor], handler);

    await pipeline({ url: '/test' } as any);

    expect(interceptor).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should chain multiple interceptors in correct order', async () => {
    const order: number[] = [];

    const first: Interceptor = async (req, next) => {
      order.push(1);
      const res = await next(req);
      order.push(4);
      return res;
    };

    const second: Interceptor = async (req, next) => {
      order.push(2);
      const res = await next(req);
      order.push(3);
      return res;
    };

    const handler: any = vi.fn(async () => {
      order.push(5);
      return 'done';
    });

    const pipeline = buildPipeline([first, second], handler);

    const result = await pipeline({} as any);

    expect(order).toEqual([1, 2, 5, 3, 4]);
    expect(result).toBe('done');
  });

  it('should propagate request modifications through the chain', async () => {
    const addHeader: Interceptor = async (req, next) => {
      return next({ ...req, headers: { ...req.headers, 'X-Custom': 'yes' } });
    };

    const handler = vi.fn().mockResolvedValue('ok');
    const pipeline = buildPipeline([addHeader], handler);

    await pipeline({ headers: {} } as any);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'X-Custom': 'yes' } })
    );
  });

  it('should catch and recover from errors in the chain', async () => {
    const recovery: Interceptor = async (req, next) => {
      try {
        return await next(req);
      } catch {
        return 'recovered' as any;
      }
    };

    const failingHandler = vi.fn().mockRejectedValue(new Error('fail'));
    const pipeline = buildPipeline([recovery], failingHandler);

    const result = await pipeline({} as any);

    expect(result).toBe('recovered');
  });
});
