import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PasswordChangeGuard } from './password-change.guard';

describe('PasswordChangeGuard', () => {
  let guard: PasswordChangeGuard;

  beforeEach(() => {
    guard = new PasswordChangeGuard();
  });

  function createMockExecutionContext(user: any, path: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          path,
          url: path,
          route: { path },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow request if user is not authenticated or undefined', () => {
    const context = createMockExecutionContext(undefined, '/societies');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow request if mustChangePassword is false', () => {
    const context = createMockExecutionContext(
      { id: 'u-1', mustChangePassword: false },
      '/societies',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow request if mustChangePassword is true but route is change-password', () => {
    const context = createMockExecutionContext(
      { id: 'u-1', mustChangePassword: true },
      '/api/v1/auth/change-password',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if mustChangePassword is true and route is not change-password', () => {
    const context = createMockExecutionContext(
      { id: 'u-1', mustChangePassword: true },
      '/api/v1/societies',
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
