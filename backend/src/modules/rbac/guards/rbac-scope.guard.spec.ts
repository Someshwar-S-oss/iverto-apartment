import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RbacScopeGuard } from './rbac-scope.guard';
import { RbacService } from '../rbac.service';
import { ScopeType } from '../rbac.constants';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

describe('RbacScopeGuard', () => {
  let guard: RbacScopeGuard;
  let reflector: Reflector;
  let rbacService: jest.Mocked<RbacService>;

  beforeEach(async () => {
    const mockRbacService = {
      assertPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacScopeGuard,
        Reflector,
        { provide: RbacService, useValue: mockRbacService },
      ],
    }).compile();

    guard = module.get<RbacScopeGuard>(RbacScopeGuard);
    reflector = module.get<Reflector>(Reflector);
    rbacService = module.get(RbacService);
  });

  const createMockExecutionContext = (options: {
    user?: any;
    params?: any;
    query?: any;
    headers?: any;
    body?: any;
  }): ExecutionContext => {
    const req = {
      user: options.user,
      params: options.params || {},
      query: options.query || {},
      headers: options.headers || {},
      body: options.body || {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no @RequirePermission metadata is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

    const context = createMockExecutionContext({});
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(rbacService.assertPermission).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException if user is not authenticated', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'approval.decide',
      scopeType: ScopeType.UNIT,
    });

    const context = createMockExecutionContext({ user: null });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('User not authenticated'),
    );
  });

  it('should allow immediately if user is superadmin', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'society.delete',
      scopeType: ScopeType.GLOBAL,
    });

    const context = createMockExecutionContext({
      user: { id: 'admin-1', isSuperadmin: true },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(rbacService.assertPermission).not.toHaveBeenCalled();
  });

  it('should extract targetScopeId from route params and invoke rbacService.assertPermission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'approval.decide',
      scopeType: ScopeType.UNIT,
    });

    rbacService.assertPermission.mockResolvedValue(true);

    const context = createMockExecutionContext({
      user: { id: 'user-1', isSuperadmin: false },
      params: { unitId: 'unit-123' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(rbacService.assertPermission).toHaveBeenCalledWith(
      'user-1',
      'approval.decide',
      ScopeType.UNIT,
      'unit-123',
    );
  });

  it('should extract targetScopeId from x-active-context-id header if params are missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'passcode.create',
      scopeType: ScopeType.UNIT,
    });

    rbacService.assertPermission.mockResolvedValue(true);

    const context = createMockExecutionContext({
      user: { sub: 'user-1', isSuperadmin: false },
      headers: { 'x-active-context-id': 'unit-hdr-456' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(rbacService.assertPermission).toHaveBeenCalledWith(
      'user-1',
      'passcode.create',
      ScopeType.UNIT,
      'unit-hdr-456',
    );
  });

  it('should throw ForbiddenException if rbacService.assertPermission returns false', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'unit.manage',
      scopeType: ScopeType.SOCIETY,
    });

    rbacService.assertPermission.mockResolvedValue(false);

    const context = createMockExecutionContext({
      user: { id: 'user-unauth', isSuperadmin: false },
      params: { societyId: 'soc-789' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Missing required permission: unit.manage on SOCIETY'),
    );
  });
});
