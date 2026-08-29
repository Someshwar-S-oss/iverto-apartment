import apiClient from './client';
import type {
  Device,
  DeviceVendor,
  Society,
  SuperadminAnalytics,
} from './types';

export interface CreateSocietyPayload {
  name: string;
  timezone?: string;
  address?: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
}

export interface CreateSocietyResponse {
  society: Society;
  adminUser: {
    id: string;
    email: string;
    name: string;
    phone: string;
    tempPassword?: string;
  };
}

export interface UpdateSocietyStatusPayload {
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface ProvisionDevicePayload {
  societyId: string;
  gateId?: string;
  vendor: DeviceVendor;
  serialNo: string;
  name?: string;
  authToken?: string;
}

export const superadminApi = {
  /**
   * List all societies in the system.
   * Calls GET /api/v1/web/superadmin/societies.
   */
  getSocieties: async (): Promise<Society[]> => {
    const response = await apiClient.get<Society[]>('/api/v1/web/superadmin/societies');
    return response.data;
  },

  /**
   * Onboard and create a new society with initial master admin credentials.
   * Calls POST /api/v1/web/superadmin/societies.
   */
  createSociety: async (data: CreateSocietyPayload): Promise<CreateSocietyResponse> => {
    const response = await apiClient.post<CreateSocietyResponse>(
      '/api/v1/web/superadmin/societies',
      data,
    );
    return response.data;
  },

  /**
   * Update society status (ACTIVE / SUSPENDED).
   * Calls PATCH /api/v1/web/superadmin/societies/:id.
   */
  updateSocietyStatus: async (
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<Society> => {
    const response = await apiClient.patch<Society>(
      `/api/v1/web/superadmin/societies/${id}`,
      { status },
    );
    return response.data;
  },

  /**
   * List all provisioned hardware devices across all societies.
   * Calls GET /api/v1/web/superadmin/devices.
   */
  getDevices: async (): Promise<Device[]> => {
    const response = await apiClient.get<Device[]>('/api/v1/web/superadmin/devices');
    return response.data;
  },

  /**
   * Provision a new hardware device (e.g. M50 speedface, ZKTeco).
   * Calls POST /api/v1/web/superadmin/devices.
   */
  provisionDevice: async (data: ProvisionDevicePayload): Promise<Device> => {
    const response = await apiClient.post<Device>(
      '/api/v1/web/superadmin/devices',
      data,
    );
    return response.data;
  },

  /**
   * Retrieve platform-wide aggregate counts and analytics metrics.
   * Calls GET /api/v1/web/superadmin/analytics.
   */
  getAnalytics: async (): Promise<SuperadminAnalytics> => {
    const response = await apiClient.get<SuperadminAnalytics>(
      '/api/v1/web/superadmin/analytics',
    );
    return response.data;
  },
};

export default superadminApi;
