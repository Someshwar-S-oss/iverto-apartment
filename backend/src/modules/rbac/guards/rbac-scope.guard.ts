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

    // Superadmin universal override
    if (user.isSuperadmin) {
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

    const userId = user.id || user.userId || user.sub;
    const hasPermission = await this.rbacService.assertPermission(
      userId,
      permMeta.action,
      permMeta.scopeType,
      typeof targetScopeId === 'string' ? targetScopeId : undefined,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${permMeta.action} on ${permMeta.scopeType}`,
      );
    }

    return true;
  }
}
