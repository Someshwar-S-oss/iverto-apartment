import apiClient from './client';
import type {
  Building,
  Device,
  EntryEvent,
  PaginatedResult,
  SocietyDashboardStats,
  Staff,
  StaffStatus,
  StaffType,
  Unit,
  UnitRole,
  SocietyRole,
} from './types';

export interface CreateSocietyUserPayload {
  email: string;
  phone: string;
  name: string;
  role: UnitRole | SocietyRole | 'OWNER' | 'TENANT' | 'FAMILY' | 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN';
  unitId?: string;
  isPrimary?: boolean;
}

export interface CreateSocietyUserResponse {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string;
  };
  role: string;
  unitId?: string;
  tempPassword?: string;
}

export interface CreateBuildingPayload {
  name: string;
}

export interface CreateUnitPayload {
  buildingId: string;
  unitNumber: string;
}

export interface CreateStaffPayload {
  name: string;
  phone: string;
  staffType: StaffType;
  photoData?: string;
  facePersonRef?: string;
}

export interface UpdateStaffPayload {
  name?: string;
  phone?: string;
  staffType?: StaffType;
  photoData?: string;
  facePersonRef?: string;
  status?: StaffStatus;
}

export interface GetLogsParams {
  page?: number;
  limit?: number;
}

export const societyAdminApi = {
  /**
   * Get KPI dashboard stats for the society (units count, active staff, devices, today's entries).
   * Calls GET /api/v1/web/societies/:societyId/dashboard.
   */
  getDashboardStats: async (societyId: string): Promise<SocietyDashboardStats> => {
    const response = await apiClient.get<SocietyDashboardStats>(
      `/api/v1/web/societies/${societyId}/dashboard`,
    );
    return response.data;
  },

  /**
   * List all units and their associated buildings in the society.
   * Calls GET /api/v1/web/societies/:societyId/units.
   */
  getUnits: async (societyId: string): Promise<Unit[]> => {
    const response = await apiClient.get<Unit[]>(
      `/api/v1/web/societies/${societyId}/units`,
    );
    return response.data;
  },

  /**
   * Create a new residential building/tower/wing in the society.
   * Calls POST /api/v1/web/societies/:societyId/buildings.
   */
  createBuilding: async (societyId: string, name: string): Promise<Building> => {
    const response = await apiClient.post<Building>(
      `/api/v1/web/societies/${societyId}/buildings`,
      { name },
    );
    return response.data;
  },

  /**
   * Create a new unit/flat within a specific building.
   * Calls POST /api/v1/web/societies/:societyId/units.
   */
  createUnit: async (
    societyId: string,
    buildingId: string,
    unitNumber: string,
  ): Promise<Unit> => {
    const response = await apiClient.post<Unit>(
      `/api/v1/web/societies/${societyId}/units`,
      { buildingId, unitNumber },
    );
    return response.data;
  },

  /**
   * Create a resident, guard, supervisor, or society admin user with temporary credentials.
   * Calls POST /api/v1/web/societies/:societyId/users.
   */
  createUser: async (
    societyId: string,
    data: CreateSocietyUserPayload,
  ): Promise<CreateSocietyUserResponse> => {
    const response = await apiClient.post<CreateSocietyUserResponse>(
      `/api/v1/web/societies/${societyId}/users`,
      data,
    );
    return response.data;
  },

  /**
   * List society staff (maids, cooks, drivers, etc.).
   * Calls GET /api/v1/web/societies/:societyId/staff.
   */
  getStaff: async (
    societyId: string,
    status?: StaffStatus,
  ): Promise<Staff[]> => {
    const params = status ? { status } : undefined;
    const response = await apiClient.get<Staff[]>(
      `/api/v1/web/societies/${societyId}/staff`,
      { params },
    );
    return response.data;
  },

  /**
   * Register a new staff member (with optional face reference/photo).
   * Calls POST /api/v1/web/societies/:societyId/staff.
   */
  createStaff: async (
    societyId: string,
    data: CreateStaffPayload,
  ): Promise<Staff> => {
    const response = await apiClient.post<Staff>(
      `/api/v1/web/societies/${societyId}/staff`,
      data,
    );
    return response.data;
  },

  /**
   * Update staff member details or active status.
   * Calls PATCH /api/v1/web/societies/:societyId/staff/:staffId.
   */
  updateStaff: async (
    societyId: string,
    staffId: string,
    data: UpdateStaffPayload,
  ): Promise<Staff> => {
    const response = await apiClient.patch<Staff>(
      `/api/v1/web/societies/${societyId}/staff/${staffId}`,
      data,
    );
    return response.data;
  },

  /**
   * Fetch paginated audit / entry event activity logs for the society.
   * Calls GET /api/v1/web/societies/:societyId/logs.
   */
  getLogs: async (
    societyId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<EntryEvent>> => {
    const response = await apiClient.get<any>(
      `/api/v1/web/societies/${societyId}/logs`,
      {
        params: { page, limit },
      },
    );

    // Normalize response if returned directly as array or as object
    if (Array.isArray(response.data)) {
      return {
        data: response.data,
        total: response.data.length,
        page,
        limit,
      };
    }

    return {
      data: response.data.data || [],
      total: response.data.total ?? response.data.data?.length ?? 0,
      page: response.data.page ?? page,
      limit: response.data.limit ?? limit,
    };
  },

  /**
   * List hardware devices provisioned for this society.
   * Calls GET /api/v1/web/societies/:societyId/devices.
   */
  getDevices: async (societyId: string): Promise<Device[]> => {
    const response = await apiClient.get<Device[]>(
      `/api/v1/web/societies/${societyId}/devices`,
    );
    return response.data;
  },
};

export default societyAdminApi;
