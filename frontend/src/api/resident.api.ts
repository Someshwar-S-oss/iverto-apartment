import apiClient from './client';
import type {
  Approval,
  DeliveryMode,
  DeliveryPermission,
  DeliveryPlatform,
  EntryEvent,
  PaginatedResult,
  Passcode,
  Staff,
} from './types';

export interface CreatePasscodePayload {
  code?: string;
  validFrom?: string | Date;
  validUntil: string | Date;
  maxUses?: number;
}

export interface UpdateDeliveryPermissionPayload {
  mode: DeliveryMode;
  windowStart?: string | null;
  windowEnd?: string | null;
  silent?: boolean;
}

export const residentApi = {
  /**
   * Get pending visitor entry approval requests for this unit.
   * Calls GET /api/v1/mobile/units/:unitId/pending.
   */
  getPendingApprovals: async (unitId: string): Promise<Approval[]> => {
    const response = await apiClient.get<Approval[]>(
      `/api/v1/mobile/units/${unitId}/pending`,
    );
    return response.data;
  },

  /**
   * Approve or reject a pending entry approval request.
   * Calls POST /api/v1/mobile/units/:unitId/approvals/:approvalId/decide.
   */
  decideApproval: async (
    unitId: string,
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
  ): Promise<Approval> => {
    const response = await apiClient.post<Approval>(
      `/api/v1/mobile/units/${unitId}/approvals/${approvalId}/decide`,
      { decision },
    );
    return response.data;
  },

  /**
   * Fetch visitor and staff entry/exit history for this unit.
   * Calls GET /api/v1/mobile/units/:unitId/entry-events.
   */
  getEntryEvents: async (
    unitId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<EntryEvent>> => {
    const response = await apiClient.get<any>(
      `/api/v1/mobile/units/${unitId}/entry-events`,
      {
        params: { page, limit },
      },
    );

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
   * Get staff members assigned to this unit (e.g. resident's maid/cook).
   * Calls GET /api/v1/mobile/units/:unitId/staff.
   */
  getStaff: async (unitId: string): Promise<Staff[]> => {
    const response = await apiClient.get<Staff[]>(
      `/api/v1/mobile/units/${unitId}/staff`,
    );
    return response.data;
  },

  /**
   * Get all active verified domestic staff in the unit's society for flat assignment.
   * Calls GET /api/v1/mobile/units/:unitId/society-staff.
   */
  getAvailableSocietyStaff: async (unitId: string): Promise<Staff[]> => {
    const response = await apiClient.get<Staff[]>(
      `/api/v1/mobile/units/${unitId}/society-staff`,
    );
    return response.data;
  },

  /**
   * Assign a society staff member to this residential unit.
   * Calls POST /api/v1/mobile/units/:unitId/staff.
   */
  assignStaff: async (
    unitId: string,
    staffId: string,
    notify: boolean = true,
  ): Promise<any> => {
    const response = await apiClient.post(
      `/api/v1/mobile/units/${unitId}/staff`,
      { staffId, notify },
    );
    return response.data;
  },

  /**
   * Unassign a staff member from this unit.
   * Calls DELETE /api/v1/mobile/units/:unitId/staff/:staffId.
   */
  unassignStaff: async (
    unitId: string,
    staffId: string,
  ): Promise<{ success: boolean; message?: string }> => {
    const response = await apiClient.delete(
      `/api/v1/mobile/units/${unitId}/staff/${staffId}`,
    );
    return response.data;
  },

  /**
   * Create an OTP or passcode for a guest/delivery person.
   * Calls POST /api/v1/mobile/units/:unitId/passcodes.
   */
  createPasscode: async (
    unitId: string,
    data: CreatePasscodePayload,
  ): Promise<Passcode> => {
    const payload = {
      ...data,
      validFrom: data.validFrom instanceof Date ? data.validFrom.toISOString() : data.validFrom,
      validUntil: data.validUntil instanceof Date ? data.validUntil.toISOString() : data.validUntil,
    };

    const response = await apiClient.post<Passcode>(
      `/api/v1/mobile/units/${unitId}/passcodes`,
      payload,
    );
    return response.data;
  },

  /**
   * List all generated passcodes for this unit.
   * Calls GET /api/v1/mobile/units/:unitId/passcodes.
   */
  listPasscodes: async (unitId: string): Promise<Passcode[]> => {
    const response = await apiClient.get<Passcode[]>(
      `/api/v1/mobile/units/${unitId}/passcodes`,
    );
    return response.data;
  },

  /**
   * Revoke an active passcode immediately.
   * Calls DELETE /api/v1/mobile/units/:unitId/passcodes/:id.
   */
  revokePasscode: async (unitId: string, id: string): Promise<Passcode> => {
    const response = await apiClient.delete<Passcode>(
      `/api/v1/mobile/units/${unitId}/passcodes/${id}`,
    );
    return response.data;
  },

  /**
   * Get custom delivery automation permissions (e.g. Swiggy, Blinkit, Zepto).
   * Calls GET /api/v1/mobile/units/:unitId/delivery-permissions.
   */
  getDeliveryPermissions: async (
    unitId: string,
  ): Promise<DeliveryPermission[]> => {
    const response = await apiClient.get<DeliveryPermission[]>(
      `/api/v1/mobile/units/${unitId}/delivery-permissions`,
    );
    return response.data;
  },

  /**
   * Configure delivery automation rules for a platform (ASK_ME, LEAVE_AT_GATE, ALLOW_TO_DOOR).
   * Calls PUT /api/v1/mobile/units/:unitId/delivery-permissions/:platform.
   */
  updateDeliveryPermission: async (
    unitId: string,
    platform: DeliveryPlatform,
    data: UpdateDeliveryPermissionPayload,
  ): Promise<DeliveryPermission> => {
    const response = await apiClient.put<DeliveryPermission>(
      `/api/v1/mobile/units/${unitId}/delivery-permissions/${platform}`,
      data,
    );
    return response.data;
  },
};

export default residentApi;
