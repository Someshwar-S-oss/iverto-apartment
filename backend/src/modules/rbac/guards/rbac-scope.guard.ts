import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PermissionMetadata } from '../decorators/require-permission.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class RbacScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permMeta = this.reflector.getAllAndOverride<PermissionMetadata>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permMeta) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userId = user.id || user.userId || user.sub;

    // Superadmin universal override
    if (user.isSuperadmin) {
      // No societyId to scope to (and none needed — every RLS policy already grants
      // is_superadmin a full bypass), but still route the request through a real
      // transaction so RlsContextInterceptor picks it up.
      request.rlsContext = { userId, isSuperadmin: true };
      return true;
    }

    const targetScopeId =
      request.params?.unitId ||
      request.params?.societyId ||
      request.params?.gateId ||
      request.params?.id ||
      request.query?.unitId ||
      request.query?.societyId ||
      request.query?.gateId ||
      (request.headers ? request.headers['x-active-context-id'] : undefined) ||
      request.body?.unitId ||
      request.body?.societyId ||
      request.body?.gateId;

    const resolvedTargetScopeId = typeof targetScopeId === 'string' ? targetScopeId : undefined;

    const hasPermission = await this.rbacService.assertPermission(
      userId,
      permMeta.action,
      permMeta.scopeType,
      resolvedTargetScopeId,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${permMeta.action} on ${permMeta.scopeType}`,
      );
    }

    // Resolved independently of the pass/fail decision above (assertPermission already
    // made that call) — this purely determines which society's rows RlsContextInterceptor
    // should scope the rest of the request's queries to at the database level.
    const societyId = await this.rbacService.resolveScopeSocietyId(
      userId,
      permMeta.scopeType,
      resolvedTargetScopeId,
    );
    request.rlsContext = { userId, isSuperadmin: false, societyId };

    return true;
  }
}
