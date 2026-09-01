import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RlsContextInterceptor } from './rls-context.interceptor';
import { DrizzleService } from '../../database/drizzle.service';

describe('RlsContextInterceptor', () => {
  let interceptor: RlsContextInterceptor;
  let mockDrizzle: any;

  beforeEach(() => {
    mockDrizzle = {
      withTenantContext: jest.fn((ctx: any, cb: any) => cb()),
    };
    interceptor = new RlsContextInterceptor(mockDrizzle as DrizzleService);
  });

  const makeHttpContext = (request: any): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('passes through untouched when the request has no rlsContext', async () => {
    const request = {};
    const next: CallHandler = { handle: () => of('unscoped-result') };

    const result = await interceptor.intercept(makeHttpContext(request), next).toPromise();

    expect(result).toBe('unscoped-result');
    expect(mockDrizzle.withTenantContext).not.toHaveBeenCalled();
  });

  it('skips non-HTTP execution contexts entirely', async () => {
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ws-result') };

    const result = await interceptor.intercept(context, next).toPromise();

    expect(result).toBe('ws-result');
    expect(mockDrizzle.withTenantContext).not.toHaveBeenCalled();
  });

  it('wraps the handler in withTenantContext using request.rlsContext', async () => {
    const rlsContext = { userId: 'user-1', societyId: 'soc-1', isSuperadmin: false };
    const request = { rlsContext };
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const result = await interceptor.intercept(makeHttpContext(request), next).toPromise();

    expect(result).toEqual({ ok: true });
    expect(mockDrizzle.withTenantContext).toHaveBeenCalledWith(rlsContext, expect.any(Function));
  });

  it('propagates a normal handler error unchanged', async () => {
    const request = { rlsContext: { isSuperadmin: true } };
    const boom = new Error('something else broke');
    const next: CallHandler = { handle: () => throwError(() => boom) };

    await expect(interceptor.intercept(makeHttpContext(request), next).toPromise()).rejects.toBe(boom);
  });

  it('maps a Postgres RLS violation (42501) to a clean ForbiddenException', async () => {
    const request = { rlsContext: { isSuperadmin: false, societyId: 'soc-1' } };
    const pgError = Object.assign(new Error('new row violates row-level security policy'), {
      code: '42501',
    });
    mockDrizzle.withTenantContext = jest.fn().mockRejectedValue(pgError);
    const next: CallHandler = { handle: () => of('unused') };

    await expect(interceptor.intercept(makeHttpContext(request), next).toPromise()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
