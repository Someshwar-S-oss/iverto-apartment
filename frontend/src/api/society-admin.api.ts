import apiClient from './client';
import type {
  Building,
  Device,
  EntryEvent,
  Gate,
  PaginatedResult,
  SocietyDashboardStats,
  Staff,
  StaffStatus,
  StaffType,
  Unit,
  UnitRole,
  SocietyRole,
  Notice,
  Complaint,
  ComplaintStatus,
} from './types';

export interface CreateSocietyUserPayload {
  email: string;
  phone: string;
  name: string;
  role: UnitRole | SocietyRole | 'OWNER' | 'TENANT' | 'FAMILY' | 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN';
  unitId?: string;
  isPrimary?: boolean;
  // Only meaningful for GUARD/GUARD_SUPERVISOR. Omitted/null = unrestricted (every gate
  // in the society) — the default, and the only option for GUARD_SUPERVISOR in practice.
  gateId?: string | null;
}

export interface CreateGatePayload {
  name: string;
  description?: string;
}

export interface UpdateGatePayload {
  name?: string;
  description?: string;
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
   * List all buildings/towers in the society.
   * Calls GET /api/v1/web/societies/:societyId/buildings.
   */
  getBuildings: async (societyId: string): Promise<Building[]> => {
    const response = await apiClient.get<Building[]>(
      `/api/v1/web/societies/${societyId}/buildings`,
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
   * List all residents, guards, and admins registered for this society.
   * Calls GET /api/v1/web/societies/:societyId/users.
   */
  getUsers: async (societyId: string): Promise<any[]> => {
    const response = await apiClient.get<any[]>(
      `/api/v1/web/societies/${societyId}/users`,
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

  /**
   * List gates (physical entrances) defined for this society.
   * Calls GET /api/v1/web/societies/:societyId/gates.
   */
  getGates: async (societyId: string): Promise<Gate[]> => {
    const response = await apiClient.get<Gate[]>(
      `/api/v1/web/societies/${societyId}/gates`,
    );
    return response.data;
  },

  /**
   * Create a new gate.
   * Calls POST /api/v1/web/societies/:societyId/gates.
   */
  createGate: async (societyId: string, data: CreateGatePayload): Promise<Gate> => {
    const response = await apiClient.post<Gate>(
      `/api/v1/web/societies/${societyId}/gates`,
      data,
    );
    return response.data;
  },

  /**
   * Rename or update a gate.
   * Calls PATCH /api/v1/web/societies/:societyId/gates/:gateId.
   */
  updateGate: async (societyId: string, gateId: string, data: UpdateGatePayload): Promise<Gate> => {
    const response = await apiClient.patch<Gate>(
      `/api/v1/web/societies/${societyId}/gates/${gateId}`,
      data,
    );
    return response.data;
  },

  /**
   * Delete a gate. Guards assigned to it and devices pointed at it fall back to
   * unrestricted/unassigned rather than being locked out or orphaned.
   * Calls DELETE /api/v1/web/societies/:societyId/gates/:gateId.
   */
  deleteGate: async (societyId: string, gateId: string): Promise<Gate> => {
    const response = await apiClient.delete<Gate>(
      `/api/v1/web/societies/${societyId}/gates/${gateId}`,
    );
    return response.data;
  },

  /**
   * Assign (or, with gateId: null, unassign back to unrestricted) a guard/supervisor to
   * one specific gate.
   * Calls PATCH /api/v1/web/societies/:societyId/guards/:userId/gate.
   */
  assignGuardGate: async (
    societyId: string,
    userId: string,
    gateId: string | null,
  ): Promise<unknown> => {
    const response = await apiClient.patch(
      `/api/v1/web/societies/${societyId}/guards/${userId}/gate`,
      { gateId },
    );
    return response.data;
  },

  /**
   * Get community notices/announcements for a society.
   * Calls GET /api/v1/web/societies/:societyId/notices.
   */
  getNotices: async (societyId: string): Promise<Notice[]> => {
    const response = await apiClient.get<Notice[]>(
      `/api/v1/web/societies/${societyId}/notices`,
    );
    return response.data;
  },

  /**
   * Create a new notice/announcement. Author identity is derived server-side from the
   * authenticated caller, so only title/body/category/isPinned are ever sent.
   * Calls POST /api/v1/web/societies/:societyId/notices.
   */
  createNotice: async (
    societyId: string,
    data: Pick<Notice, 'title' | 'body' | 'category' | 'isPinned'>,
  ): Promise<Notice> => {
    const response = await apiClient.post<Notice>(
      `/api/v1/web/societies/${societyId}/notices`,
      data,
    );
    return response.data;
  },

  /**
   * Delete a notice.
   * Calls DELETE /api/v1/web/societies/:societyId/notices/:noticeId.
   */
  deleteNotice: async (societyId: string, noticeId: string): Promise<boolean> => {
    await apiClient.delete(`/api/v1/web/societies/${societyId}/notices/${noticeId}`);
    return true;
  },

  /**
   * Toggle pinned state of a notice.
   * Calls PATCH /api/v1/web/societies/:societyId/notices/:noticeId/pin.
   */
  togglePinNotice: async (societyId: string, noticeId: string): Promise<Notice | null> => {
    const response = await apiClient.patch<Notice>(
      `/api/v1/web/societies/${societyId}/notices/${noticeId}/pin`,
    );
    return response.data;
  },

  /**
   * Get every complaint raised across the society (society-admin helpdesk view).
   * Calls GET /api/v1/web/societies/:societyId/complaints.
   */
  getComplaints: async (societyId: string): Promise<Complaint[]> => {
    const response = await apiClient.get<Complaint[]>(
      `/api/v1/web/societies/${societyId}/complaints`,
    );
    return response.data;
  },

  /**
   * Update complaint status and admin notes.
   * Calls PATCH /api/v1/web/societies/:societyId/complaints/:complaintId.
   */
  updateComplaintStatus: async (
    societyId: string,
    complaintId: string,
    status: ComplaintStatus,
    adminNotes?: string,
  ): Promise<Complaint | null> => {
    const response = await apiClient.patch<Complaint>(
      `/api/v1/web/societies/${societyId}/complaints/${complaintId}`,
      { status, adminNotes },
    );
    return response.data;
  },

  /**
   * List staff currently assigned to a specific unit.
   * Calls GET /api/v1/web/societies/:societyId/units/:unitId/staff.
   */
  getUnitStaff: async (societyId: string, unitId: string): Promise<Staff[]> => {
    const response = await apiClient.get<Staff[]>(
      `/api/v1/web/societies/${societyId}/units/${unitId}/staff`,
    );
    return response.data;
  },

  /**
   * Assign a staff member to a unit. Site-admin only — residents cannot self-assign.
   * Calls POST /api/v1/web/societies/:societyId/staff/:staffId/units/:unitId.
   */
  assignStaffToUnit: async (
    societyId: string,
    staffId: string,
    unitId: string,
    notify: boolean = true,
  ): Promise<unknown> => {
    const response = await apiClient.post(
      `/api/v1/web/societies/${societyId}/staff/${staffId}/units/${unitId}`,
      { notify },
    );
    return response.data;
  },

  /**
   * Unassign a staff member from a unit. Site-admin only.
   * Calls DELETE /api/v1/web/societies/:societyId/staff/:staffId/units/:unitId.
   */
  unassignStaffFromUnit: async (
    societyId: string,
    staffId: string,
    unitId: string,
  ): Promise<unknown> => {
    const response = await apiClient.delete(
      `/api/v1/web/societies/${societyId}/staff/${staffId}/units/${unitId}`,
    );
    return response.data;
  },
};

export default societyAdminApi;

