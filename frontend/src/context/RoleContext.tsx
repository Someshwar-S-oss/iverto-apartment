import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import apiClient from '../api/client';
import authApi from '../api/auth.api';
import type { AppContext, User } from '../api/types';

export const ACTIVE_CONTEXT_KEY = 'iverto_active_context_id';

export interface RoleContextType {
  contexts: AppContext[];
  activeContext: AppContext | null;
  isLoadingContexts: boolean;
  switchContext: (contextId: string) => AppContext | null;
  fetchContexts: (overrideUser?: User | null, overrideToken?: string | null) => Promise<AppContext[]>;
  getPrimaryRedirectPath: (targetContext?: AppContext | null, userObj?: User | null) => string;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const GLOBAL_SUPERADMIN_CONTEXT: AppContext = {
  type: 'GLOBAL',
  id: 'global-superadmin',
  label: 'Platform Overview (Superadmin)',
  role: 'SUPERADMIN',
};

/**
 * Calculates the primary redirect path for a given context and user profile.
 */
export const calculateRedirectPath = (
  context: AppContext | null,
  user?: User | null,
): string => {
  if (user?.isSuperadmin && (!context || context.type === 'GLOBAL')) {
    return '/superadmin/overview';
  }

  if (context) {
    switch (context.type) {
      case 'GLOBAL':
        return '/superadmin/overview';
      case 'SOCIETY':
        return '/admin/dashboard';
      case 'GATE':
        return '/guard/kiosk';
      case 'UNIT':
      default:
        return '/resident/dashboard';
    }
  }

  // Fallback when context list is empty or loading for an authenticated user
  if (user?.isSuperadmin) {
    return '/superadmin/overview';
  }

  return '/resident/dashboard';
};

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [contexts, setContexts] = useState<AppContext[]>([]);
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [isLoadingContexts, setIsLoadingContexts] = useState<boolean>(false);

  const getPrimaryRedirectPath = useCallback(
    (targetContext?: AppContext | null, userObj?: User | null): string => {
      const target = targetContext !== undefined ? targetContext : activeContext;
      const targetUser = userObj !== undefined ? userObj : user;
      return calculateRedirectPath(target, targetUser);
    },
    [activeContext, user],
  );

  const selectInitialContext = useCallback(
    (availableContexts: AppContext[], currentUser: User | null): AppContext | null => {
      if (!availableContexts || availableContexts.length === 0) {
        if (currentUser?.isSuperadmin) {
          return GLOBAL_SUPERADMIN_CONTEXT;
        }
        return null;
      }

      const savedContextId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CONTEXT_KEY) : null;
      if (savedContextId) {
        const matching = availableContexts.find((c) => c.id === savedContextId);
        if (matching) return matching;
      }

      // Priority 1: Superadmin default
      if (currentUser?.isSuperadmin) {
        const globalCtx = availableContexts.find((c) => c.type === 'GLOBAL');
        if (globalCtx) return globalCtx;
        return GLOBAL_SUPERADMIN_CONTEXT;
      }

      // Priority 2: Primary Unit Context
      const primaryUnit = availableContexts.find((c) => c.type === 'UNIT' && c.isPrimary);
      if (primaryUnit) return primaryUnit;

      // Priority 3: First Unit Context
      const firstUnit = availableContexts.find((c) => c.type === 'UNIT');
      if (firstUnit) return firstUnit;

      // Priority 4: First Society Admin Context
      const firstSociety = availableContexts.find((c) => c.type === 'SOCIETY');
      if (firstSociety) return firstSociety;

      // Priority 5: First Guard Context
      const firstGate = availableContexts.find((c) => c.type === 'GATE');
      if (firstGate) return firstGate;

      // Default fallback: first context
      return availableContexts[0] || null;
    },
    [],
  );

  const fetchContexts = useCallback(
    async (overrideUser?: User | null, overrideToken?: string | null): Promise<AppContext[]> => {
      const activeToken = overrideToken || (typeof window !== 'undefined' ? localStorage.getItem('iverto_token') : null);
      const activeUser =
        overrideUser !== undefined
          ? overrideUser
          : user ||
            (typeof window !== 'undefined' && localStorage.getItem('iverto_user')
              ? JSON.parse(localStorage.getItem('iverto_user')!)
              : null);

      if (!activeToken) {
        setContexts([]);
        setActiveContext(null);
        return [];
      }

      setIsLoadingContexts(true);
      try {
        if (overrideToken) {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${overrideToken}`;
        }

        let fetched = await authApi.getMyContexts();

        // If user is superadmin, ensure GLOBAL context is in the list
        if (activeUser?.isSuperadmin) {
          const hasGlobal = fetched.some((c) => c.type === 'GLOBAL');
          if (!hasGlobal) {
            fetched = [GLOBAL_SUPERADMIN_CONTEXT, ...fetched];
          }
        }

        setContexts(fetched);

        const chosen = selectInitialContext(fetched, activeUser);
        setActiveContext(chosen);

        if (chosen && typeof window !== 'undefined') {
          localStorage.setItem(ACTIVE_CONTEXT_KEY, chosen.id);
        }

        return fetched;
      } catch (err) {
        console.error('Failed to fetch user contexts:', err);
        if (activeUser?.isSuperadmin) {
          const fallback = [GLOBAL_SUPERADMIN_CONTEXT];
          setContexts(fallback);
          setActiveContext(GLOBAL_SUPERADMIN_CONTEXT);
          return fallback;
        }
        return [];
      } finally {
        setIsLoadingContexts(false);
      }
    },
    [user, selectInitialContext],
  );

  const switchContext = useCallback(
    (contextId: string): AppContext | null => {
      const found = contexts.find(
        (c) => c.id === contextId || c.unitId === contextId || c.societyId === contextId,
      );

      if (found) {
        setActiveContext(found);
        if (typeof window !== 'undefined') {
          localStorage.setItem(ACTIVE_CONTEXT_KEY, found.id);
        }
        return found;
      }

      return null;
    },
    [contexts],
  );

  // Synchronize when auth state or user changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchContexts();
    } else {
      setContexts([]);
      setActiveContext(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_CONTEXT_KEY);
      }
    }
  }, [isAuthenticated, user?.id, user?.isSuperadmin, fetchContexts]);

  const value = useMemo(
    () => ({
      contexts,
      activeContext,
      isLoadingContexts,
      switchContext,
      fetchContexts,
      getPrimaryRedirectPath,
    }),
    [contexts, activeContext, isLoadingContexts, switchContext, fetchContexts, getPrimaryRedirectPath],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = (): RoleContextType => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};

export default RoleContext;
