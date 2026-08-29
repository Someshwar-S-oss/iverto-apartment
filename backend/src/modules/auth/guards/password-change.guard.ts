import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.mustChangePassword) {
      const path = (request.route?.path || request.path || request.url || '').toString();
      if (!path.includes('change-password')) {
        throw new ForbiddenException('Password reset required before accessing resources');
      }
    }

    return true;
  }
}
