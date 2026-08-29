import { SetMetadata } from '@nestjs/common';
import { ScopeType } from '../rbac.constants';

export const PERMISSION_KEY = 'rbac_permission';

export interface PermissionMetadata {
  action: string;
  scopeType: ScopeType;
}

export const RequirePermission = (action: string, scopeType: ScopeType) =>
  SetMetadata(PERMISSION_KEY, { action, scopeType });
