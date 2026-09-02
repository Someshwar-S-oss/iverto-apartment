import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { CenteredSpinner } from '../components/ui/States';

export interface ProtectedRouteProps {
  /**
   * List of allowed user roles for this route (e.g. ['SUPERADMIN', 'ADMIN', 'RESIDENT', 'GUARD']).
   * If provided, the active context role (or user superadmin status) must match.
   */
  allowedRoles?: string[];

  /**
   * List of allowed context scopes for this route (e.g. ['GLOBAL', 'SOCIETY', 'GATE', 'UNIT']).
   */
  allowedScopes?: string[];

  /**
   * Requires the user to have superadmin privileges.
   */
  requireSuperadmin?: boolean;

  /**
   * Optional child elements if not using React Router's Outlet.
   */
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  allowedScopes,
  requireSuperadmin = false,
  children,
}) => {
  const location = useLocation();
  const { isAuthenticated, isLoading, mustChangePassword, user } = useAuth();
  const { activeContext, isLoadingContexts, getPrimaryRedirectPath } = useRole();

  // 1. Show spinner while verifying initial authentication token
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <CenteredSpinner label="Authenticating session..." size="lg" />
      </div>
    );
  }

  // 2. Unauthenticated -> Redirect to Login with original target in location state
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Temporary password detected -> Force redirect to Change Password page
  if (mustChangePassword && location.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

// 4. If context data is still resolving, show loader for role-gated routes.
  //    Skip the blocking spinner when we already have a cached active context
  //    so the page can render with the previous state and refetch in the background.
  if (isLoadingContexts && (allowedRoles || allowedScopes || requireSuperadmin) && !activeContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <CenteredSpinner label="Loading workspace..." size="lg" />
      </div>
    );
  }

  // 5. Check Superadmin requirement
  if (requireSuperadmin && !user?.isSuperadmin) {
    const fallbackPath = getPrimaryRedirectPath();
    return <Navigate to={fallbackPath} replace />;
  }

  // 6. Check Scope / Context Type restrictions (GLOBAL, SOCIETY, GATE, UNIT)
  if (allowedScopes && allowedScopes.length > 0) {
    const currentScope = activeContext?.type;
    const isSuperadmin = user?.isSuperadmin;

    const isScopeAllowed =
      (isSuperadmin && allowedScopes.includes('GLOBAL')) ||
      (currentScope && allowedScopes.includes(currentScope));

    if (!isScopeAllowed) {
      const fallbackPath = getPrimaryRedirectPath();
      if (fallbackPath && fallbackPath !== location.pathname) {
        return <Navigate to={fallbackPath} replace />;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
          <CenteredSpinner label="Switching workspace..." size="lg" />
        </div>
      );
    }
  }

  // 7. Check Role restrictions (e.g. ADMIN, GUARD, RESIDENT, OWNER, TENANT, SUPERADMIN)
  if (allowedRoles && allowedRoles.length > 0) {
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
    const currentRole = activeContext?.role?.toUpperCase();
    const isSuperadmin = user?.isSuperadmin;

    const isRoleAllowed =
      (isSuperadmin && normalizedAllowed.includes('SUPERADMIN')) ||
      (currentRole && normalizedAllowed.includes(currentRole));

    if (!isRoleAllowed) {
      const fallbackPath = getPrimaryRedirectPath();
      if (fallbackPath && fallbackPath !== location.pathname) {
        return <Navigate to={fallbackPath} replace />;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
          <CenteredSpinner label="Switching workspace..." size="lg" />
        </div>
      );
    }
  }

  // 8. Authorized -> Render children or Outlet
  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
