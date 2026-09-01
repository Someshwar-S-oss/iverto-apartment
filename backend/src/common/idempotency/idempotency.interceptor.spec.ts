import { of, throwError, firstValueFrom } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockIdempotency: any;

  const makeContext = (request: Record<string, any>): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => ({ name: 'SomeController' }),
      getHandler: () => ({ name: 'someHandler' }),
    }) as any;

  beforeEach(() => {
    mockIdempotency = { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined) };
    interceptor = new IdempotencyInterceptor(mockIdempotency);
  });

  it('should pass through untouched when no Idempotency-Key header is present', async () => {
    const request = { headers: {}, user: { sub: 'user-1' } };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(result).toEqual({ ok: true });
    expect(mockIdempotency.get).not.toHaveBeenCalled();
  });

  it('should execute and cache the response on a cache miss', async () => {
    mockIdempotency.get.mockResolvedValue(null);
    const request = {
      headers: { 'idempotency-key': 'key-1' },
      user: { sub: 'user-1' },
    };
    const handlerFn = jest.fn().mockReturnValue(of({ id: 'entry-1' }));
    const next: CallHandler = { handle: handlerFn };

    const result = await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(result).toEqual({ id: 'entry-1' });
    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(mockIdempotency.set).toHaveBeenCalledWith(
      'idem:user-1:SomeController.someHandler:key-1',
      { id: 'entry-1' },
      24 * 60 * 60,
    );
  });

  it('should replay the cached response on a cache hit, without calling the handler again', async () => {
    mockIdempotency.get.mockResolvedValue({ id: 'entry-1', cached: true });
    const request = {
      headers: { 'idempotency-key': 'key-1' },
      user: { sub: 'user-1' },
    };
    const handlerFn = jest.fn().mockReturnValue(of({ id: 'should-not-be-used' }));
    const next: CallHandler = { handle: handlerFn };

    const result = await firstValueFrom(interceptor.intercept(makeContext(request), next));

    expect(result).toEqual({ id: 'entry-1', cached: true });
    expect(handlerFn).not.toHaveBeenCalled();
  });

  it('should not cache a failed attempt, so a retry gets a real second try', async () => {
    mockIdempotency.get.mockResolvedValue(null);
    const request = {
      headers: { 'idempotency-key': 'key-1' },
      user: { sub: 'user-1' },
    };
    const next: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(
      firstValueFrom(interceptor.intercept(makeContext(request), next)),
    ).rejects.toThrow('boom');
    expect(mockIdempotency.set).not.toHaveBeenCalled();
  });

  it('should key separately per user even with the same Idempotency-Key value', async () => {
    mockIdempotency.get.mockResolvedValue(null);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await firstValueFrom(
      interceptor.intercept(
        makeContext({ headers: { 'idempotency-key': 'shared-key' }, user: { sub: 'user-A' } }),
        next,
      ),
    );
    await firstValueFrom(
      interceptor.intercept(
        makeContext({ headers: { 'idempotency-key': 'shared-key' }, user: { sub: 'user-B' } }),
        next,
      ),
    );

    expect(mockIdempotency.get).toHaveBeenNthCalledWith(1, 'idem:user-A:SomeController.someHandler:shared-key');
    expect(mockIdempotency.get).toHaveBeenNthCalledWith(2, 'idem:user-B:SomeController.someHandler:shared-key');
  });
});
