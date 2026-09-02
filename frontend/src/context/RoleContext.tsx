import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useCache } from './CacheContext';
import apiClient, { AUTH_SESSION_KEY } from '../api/client';
import authApi from '../api/auth.api';
import type { AppContext, User } from '../api/types';

const CONTEXTS_CACHE_KEY = 'auth/my-contexts';

const readStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(AUTH_SESSION_KEY);
    return stored ? (JSON.parse(stored) as User) : null;
  } catch {
    return null;
  }
};

const pickInitialContext = (
  availableContexts: AppContext[],
  currentUser: User | null,
): AppContext | null => {
  if (!availableContexts || availableContexts.length === 0) {
    if (currentUser?.isSuperadmin) return GLOBAL_SUPERADMIN_CONTEXT;
    return null;
  }
  const savedContextId =
    typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_CONTEXT_KEY) : null;
  if (savedContextId) {
    const matching = availableContexts.find((c) => c.id === savedContextId);
    if (matching) return matching;
  }
  if (currentUser?.isSuperadmin) {
    const globalCtx = availableContexts.find((c) => c.type === 'GLOBAL');
    if (globalCtx) return globalCtx;
    return GLOBAL_SUPERADMIN_CONTEXT;
  }
  const primaryUnit = availableContexts.find((c) => c.type === 'UNIT' && c.isPrimary);
  if (primaryUnit) return primaryUnit;
  const firstUnit = availableContexts.find((c) => c.type === 'UNIT');
  if (firstUnit) return firstUnit;
  const firstSociety = availableContexts.find((c) => c.type === 'SOCIETY');
  if (firstSociety) return firstSociety;
  const firstGate = availableContexts.find((c) => c.type === 'GATE');
  if (firstGate) return firstGate;
  return availableContexts[0] || null;
};

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
  const cache = useCache();
  const cachedContexts = cache.get<AppContext[]>(CONTEXTS_CACHE_KEY);
  const initialUser = user ?? readStoredUser();
  const [contexts, setContexts] = useState<AppContext[]>(cachedContexts?.data ?? []);
  const [activeContext, setActiveContext] = useState<AppContext | null>(() => {
    if (cachedContexts?.data && cachedContexts.data.length > 0) {
      return pickInitialContext(cachedContexts.data, initialUser);
    }
    return null;
  });
  const [isLoadingContexts, setIsLoadingContexts] = useState<boolean>(false);

  const getPrimaryRedirectPath = useCallback(
    (targetContext?: AppContext | null, userObj?: User | null): string => {
      const target = targetContext !== undefined ? targetContext : activeContext;
      const targetUser = userObj !== undefined ? userObj : user;
      return calculateRedirectPath(target, targetUser);
    },
    [activeContext, user],
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
        cache.set<AppContext[]>(CONTEXTS_CACHE_KEY, [], null);
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
        cache.set<AppContext[]>(CONTEXTS_CACHE_KEY, fetched, null);

        const chosen = pickInitialContext(fetched, activeUser);
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
          cache.set<AppContext[]>(CONTEXTS_CACHE_KEY, fallback, null);
          return fallback;
        }
        return [];
      } finally {
        setIsLoadingContexts(false);
      }
    },
    [user, cache],
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
      // Only show the loading state when there is no cached context to fall back on.
      const hasCached = (cache.get<AppContext[]>(CONTEXTS_CACHE_KEY)?.data?.length ?? 0) > 0;
      setIsLoadingContexts(!hasCached);
      fetchContexts();
    } else {
      setContexts([]);
      setActiveContext(null);
      cache.remove(CONTEXTS_CACHE_KEY);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_CONTEXT_KEY);
      }
    }
  }, [isAuthenticated, user?.id, user?.isSuperadmin, fetchContexts, cache]);

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
