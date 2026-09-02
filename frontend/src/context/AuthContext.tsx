import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, AUTH_SESSION_KEY } from '../api/client';
import authApi, { LoginResponse, ChangePasswordResponse } from '../api/auth.api';
import type { User } from '../api/types';

export type UserProfile = User;

export interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<LoginResponse>;
  changePassword: (newPassword: string) => Promise<ChangePasswordResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(AUTH_SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(AUTH_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Boolean(parsed.mustChangePassword);
      }
    } catch {
      // ignore
    }
    return false;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isAuthenticated = Boolean(token && user);

  // Sync axios authorization headers on token changes
  const applyAuthHeader = useCallback((authToken: string | null) => {
    if (authToken) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }, []);

  const logout = useCallback(() => {
    // Best-effort server-side revocation — fire and forget. If this fails (offline,
    // token already gone) the local session is cleared regardless; the worst case is a
    // refresh token that outlives this logout until its own expiry, same as before this
    // endpoint existed.
    const storedRefreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
    if (storedRefreshToken) {
      authApi.logout(storedRefreshToken).catch(() => {});
    }

    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem('iverto_active_context_id');
    applyAuthHeader(null);
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
    // Wipe any cached server data so a different user signing in on the same
    // browser never sees the previous account's data.
    try {
      window.sessionStorage.removeItem('iverto_cache_v1');
    } catch {
      // ignore
    }
  }, [applyAuthHeader]);

  const login = useCallback(
    async (email: string, pass: string): Promise<LoginResponse> => {
      const res = await authApi.login(email, pass);
      const { accessToken, refreshToken, user: loggedUser, mustChangePassword: needsPasswordChange } = res;

      localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
      if (refreshToken) {
        localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
      }
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(loggedUser));
      applyAuthHeader(accessToken);

      setToken(accessToken);
      setUser(loggedUser);
      setMustChangePassword(Boolean(needsPasswordChange));

      return res;
    },
    [applyAuthHeader],
  );

  const changePassword = useCallback(
    async (newPassword: string): Promise<ChangePasswordResponse> => {
      const res = await authApi.changePassword(newPassword);
      const updatedUser: UserProfile = {
        ...(user || res.user),
        ...res.user,
        mustChangePassword: false,
      };

      if (res.accessToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, res.accessToken);
        applyAuthHeader(res.accessToken);
        setToken(res.accessToken);
      }
      // A password change revokes every prior refresh token server-side (see
      // AuthService.changePassword) and issues a fresh one for this device — store it,
      // or this device's own next silent refresh would fail.
      if (res.refreshToken) {
        localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, res.refreshToken);
      }

      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
      setMustChangePassword(false);

      return res;
    },
    [user, applyAuthHeader],
  );

  const refreshUser = useCallback(async (): Promise<void> => {
    const currentToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!currentToken) {
      logout();
      return;
    }

    try {
      // Validate session with backend contexts call
      await authApi.getMyContexts();
      // Keep session fresh if call succeeds
      if (user) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
      }
      return;
    } catch (err: any) {
      if (err?.status === 401) {
        logout();
      }
    }
  }, [user, logout]);

  // Initial mount verification and unauthorized event listener
  useEffect(() => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (storedToken) {
      applyAuthHeader(storedToken);
      setToken(storedToken);
    } else {
      logout();
    }
    setIsLoading(false);

    // Global listener for 401 unauthorized token expiration
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener('iverto:auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('iverto:auth:unauthorized', handleUnauthorized);
    };
  }, [applyAuthHeader, logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        mustChangePassword,
        isLoading,
        login,
        changePassword,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
