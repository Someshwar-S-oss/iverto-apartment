import apiClient from './client';
import type {
  AppContext,
  RawUserContextsResponse,
  User,
} from './types';

export interface LoginResponse {
  accessToken: string;
  mustChangePassword: boolean;
  user: User;
}

export interface ChangePasswordResponse {
  accessToken: string;
  message: string;
  user: User;
}

export interface RegisterDeviceTokenPayload {
  fcmToken: string;
  platform: 'android' | 'ios' | 'web';
}

export const authApi = {
  /**
   * Authenticates user with email and password.
   * Calls POST /api/v1/auth/login.
   */
  login: async (email: string, pass: string): Promise<LoginResponse> => {
    const response = await apiClient.post<any>('/api/v1/auth/login', {
      email,
      password: pass,
    });

    const data = response.data;
    const user: User = {
      id: data.user?.id || data.id,
      email: data.user?.email || data.email,
      name: data.user?.name || data.name,
      phone: data.user?.phone || data.phone,
      isSuperadmin: data.user?.isSuperadmin ?? data.isSuperadmin ?? false,
      mustChangePassword: data.user?.mustChangePassword ?? data.mustChangePassword ?? false,
      status: data.user?.status || data.status || 'ACTIVE',
      avatarKey: data.user?.avatarKey || data.avatarKey || null,
    };

    return {
      accessToken: data.accessToken,
      mustChangePassword: Boolean(user.mustChangePassword),
      user,
    };
  },

  /**
   * Updates user password (mandatory upon first login).
   * Calls POST /api/v1/auth/change-password.
   */
  changePassword: async (newPassword: string): Promise<ChangePasswordResponse> => {
    const response = await apiClient.post<any>('/api/v1/auth/change-password', {
      newPassword,
    });

    const data = response.data;
    const user: User = {
      id: data.user?.id || data.id,
      email: data.user?.email || data.email,
      name: data.user?.name || data.name,
      phone: data.user?.phone || data.phone,
      isSuperadmin: data.user?.isSuperadmin ?? data.isSuperadmin ?? false,
      mustChangePassword: false,
    };

    return {
      accessToken: data.accessToken,
      message: data.message || 'Password changed successfully',
      user,
    };
  },

  /**
   * Fetches raw membership contexts from backend.
   * Calls GET /api/v1/mobile/me/contexts.
   */
  getRawContexts: async (): Promise<RawUserContextsResponse> => {
    const response = await apiClient.get<RawUserContextsResponse>('/api/v1/mobile/me/contexts');
    return response.data;
  },

  /**
   * Fetches normalized application context list for switcher and route guards.
   * Transforms raw units and societies into unified AppContext[] list.
   */
  getMyContexts: async (): Promise<AppContext[]> => {
    const response = await apiClient.get<RawUserContextsResponse>('/api/v1/mobile/me/contexts');
    const { units = [], societies = [] } = response.data || {};

    const contexts: AppContext[] = [];

    // Map unit contexts (Resident / Owner / Tenant)
    for (const u of units) {
      const bldg = u.buildingName ? `${u.buildingName} - ` : '';
      const unitLabel = u.unitNumber ? `Flat ${u.unitNumber}` : 'Unit';
      const socLabel = u.societyName ? ` (${u.societyName})` : '';

      contexts.push({
        type: 'UNIT',
        id: u.unitId,
        label: `${bldg}${unitLabel}${socLabel}`,
        role: u.role,
        unitId: u.unitId,
        societyId: u.societyId,
        unitNumber: u.unitNumber,
        buildingName: u.buildingName,
        societyName: u.societyName,
        isPrimary: u.isPrimary,
      });
    }

    // Map society & guard contexts
    for (const s of societies) {
      const isGuard = s.role === 'GUARD' || s.role === 'GUARD_SUPERVISOR';
      if (isGuard) {
        contexts.push({
          type: 'GATE',
          id: s.societyId,
          label: `${s.societyName || 'Society'} (${s.role === 'GUARD_SUPERVISOR' ? 'Gate Supervisor' : 'Security Guard'})`,
          role: s.role,
          societyId: s.societyId,
          gateId: s.societyId,
          societyName: s.societyName,
        });
      } else {
        contexts.push({
          type: 'SOCIETY',
          id: s.societyId,
          label: `${s.societyName || 'Society Admin'} (${s.role.replace(/_/g, ' ')})`,
          role: s.role,
          societyId: s.societyId,
          societyName: s.societyName,
        });
      }
    }

    return contexts;
  },

  /**
   * Registers FCM device push notification token.
   * Calls POST /api/v1/mobile/me/device-token.
   */
  registerDeviceToken: async (
    fcmToken: string,
    platform: 'android' | 'ios' | 'web' = 'web',
  ): Promise<{ success: boolean; message?: string }> => {
    const payload: RegisterDeviceTokenPayload = { fcmToken, platform };
    const response = await apiClient.post('/api/v1/mobile/me/device-token', payload);
    return response.data;
  },
};

export default authApi;
