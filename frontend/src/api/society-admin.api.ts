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

  /**
   * Get community notices/announcements for a society.
   */
  getNotices: async (societyId: string): Promise<Notice[]> => {
    const storageKey = `iverto_notices_${societyId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // fallback
      }
    }
    const defaultNotices: Notice[] = [
      {
        id: 'not-1',
        societyId,
        title: 'Elevator Maintenance in Tower B',
        body: 'Scheduled preventative maintenance for Passenger Lift 2 in Tower B on Saturday from 10:00 AM to 2:00 PM. Please use Lift 1 during this window.',
        category: 'MAINTENANCE',
        isPinned: true,
        authorName: 'Society Management',
        authorRole: 'SOCIETY_ADMIN',
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
      {
        id: 'not-2',
        societyId,
        title: 'New M50 Facial Recognition Protocol at Main Gate',
        body: 'All domestic helpers, cooks, and recurring staff members must have their biometric profile paired at the security desk for automatic boom barrier opening.',
        category: 'SECURITY',
        isPinned: true,
        authorName: 'Chief Security Officer',
        authorRole: 'GUARD_SUPERVISOR',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'not-3',
        societyId,
        title: 'Annual General Body Meeting (AGM) - Save the Date',
        body: 'The Annual General Body Meeting for the financial year will be hosted at the Community Clubhouse on the second Sunday of next month at 6:00 PM.',
        category: 'EVENT',
        isPinned: false,
        authorName: 'Management Committee',
        authorRole: 'SOCIETY_ADMIN',
        createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
      },
      {
        id: 'not-4',
        societyId,
        title: 'Water Tank Cleaning Notification',
        body: 'Overhead water tank cleaning will take place on Tuesday between 1:00 PM and 5:00 PM. Water supply may experience low pressure.',
        category: 'MAINTENANCE',
        isPinned: false,
        authorName: 'Facility Manager',
        authorRole: 'SOCIETY_ADMIN',
        createdAt: new Date(Date.now() - 3600000 * 120).toISOString(),
      },
    ];
    localStorage.setItem(storageKey, JSON.stringify(defaultNotices));
    return defaultNotices;
  },

  /**
   * Create a new notice/announcement.
   */
  createNotice: async (
    societyId: string,
    data: Omit<Notice, 'id' | 'societyId' | 'createdAt'>,
  ): Promise<Notice> => {
    const storageKey = `iverto_notices_${societyId}`;
    const notices = await societyAdminApi.getNotices(societyId);
    const newNotice: Notice = {
      id: `not-${Date.now()}`,
      societyId,
      title: data.title,
      body: data.body,
      category: data.category || 'GENERAL',
      isPinned: data.isPinned ?? false,
      authorName: data.authorName || 'Society Admin',
      authorRole: data.authorRole || 'SOCIETY_ADMIN',
      createdAt: new Date().toISOString(),
    };
    const updated = [newNotice, ...notices];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return newNotice;
  },

  /**
   * Delete a notice.
   */
  deleteNotice: async (societyId: string, noticeId: string): Promise<boolean> => {
    const storageKey = `iverto_notices_${societyId}`;
    const notices = await societyAdminApi.getNotices(societyId);
    const updated = notices.filter((n) => n.id !== noticeId);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return true;
  },

  /**
   * Toggle pinned state of a notice.
   */
  togglePinNotice: async (societyId: string, noticeId: string): Promise<Notice | null> => {
    const storageKey = `iverto_notices_${societyId}`;
    const notices = await societyAdminApi.getNotices(societyId);
    let target: Notice | null = null;
    const updated = notices.map((n) => {
      if (n.id === noticeId) {
        target = { ...n, isPinned: !n.isPinned, updatedAt: new Date().toISOString() };
        return target;
      }
      return n;
    });
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return target;
  },

  /**
   * Get resident complaints.
   */
  getComplaints: async (societyId: string): Promise<Complaint[]> => {
    const storageKey = `iverto_complaints_${societyId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // fallback
      }
    }
    const defaultComplaints: Complaint[] = [
      {
        id: 'cmp-1',
        societyId,
        unitNumber: 'A-402',
        buildingName: 'Tower A',
        residentName: 'Rajesh Sharma',
        residentPhone: '+91 98765 43210',
        title: 'Water seepage near main bathroom wall',
        description: 'Consistent dampness and water staining observed on the common wall of bathroom in A-402 since last monsoon shower.',
        category: 'PLUMBING',
        priority: 'HIGH',
        status: 'OPEN',
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: 'cmp-2',
        societyId,
        unitNumber: 'B-1104',
        buildingName: 'Tower B',
        residentName: 'Priya Iyer',
        residentPhone: '+91 98112 34567',
        title: 'Corridor emergency light flickering at night',
        description: '11th floor east-wing corridor light has loose wiring and flickers continuously between 8 PM and midnight.',
        category: 'ELECTRICAL',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        adminNotes: 'Electrician dispatched; replacement LED fixture scheduled for tomorrow morning.',
        createdAt: new Date(Date.now() - 3600000 * 28).toISOString(),
      },
      {
        id: 'cmp-3',
        societyId,
        unitNumber: 'C-203',
        buildingName: 'Tower C',
        residentName: 'Amit Patel',
        residentPhone: '+91 97654 32109',
        title: 'Unauthorized vehicle parked in allocated slot #44',
        description: 'Black SUV MH-02-CD-5678 was parked in my reserved basement slot #44 without prior intimation.',
        category: 'PARKING',
        priority: 'HIGH',
        status: 'RESOLVED',
        adminNotes: 'Security identified visitor car and had it relocated to visitor parking bay #8.',
        createdAt: new Date(Date.now() - 3600000 * 50).toISOString(),
        resolvedAt: new Date(Date.now() - 3600000 * 42).toISOString(),
      },
      {
        id: 'cmp-4',
        societyId,
        unitNumber: 'A-801',
        buildingName: 'Tower A',
        residentName: 'Sunita Verma',
        residentPhone: '+91 99201 12233',
        title: 'Unattended pet barking on balcony during work hours',
        description: 'Repeated excessive pet noise from neighboring flat between 2 PM and 5 PM on weekdays.',
        category: 'NOISE',
        priority: 'LOW',
        status: 'CLOSED',
        adminNotes: 'Resident contacted and advised on pet courtesy hours.',
        createdAt: new Date(Date.now() - 3600000 * 120).toISOString(),
        resolvedAt: new Date(Date.now() - 3600000 * 96).toISOString(),
      },
    ];
    localStorage.setItem(storageKey, JSON.stringify(defaultComplaints));
    return defaultComplaints;
  },

  /**
   * Create a new complaint from a resident.
   */
  createComplaint: async (
    societyId: string,
    data: Omit<Complaint, 'id' | 'societyId' | 'createdAt' | 'status'> & { status?: ComplaintStatus },
  ): Promise<Complaint> => {
    const storageKey = `iverto_complaints_${societyId}`;
    const complaints = await societyAdminApi.getComplaints(societyId);
    const newComplaint: Complaint = {
      id: `cmp-${Date.now()}`,
      societyId,
      unitId: data.unitId,
      unitNumber: data.unitNumber,
      buildingName: data.buildingName,
      residentName: data.residentName,
      residentPhone: data.residentPhone,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: data.status || 'OPEN',
      adminNotes: data.adminNotes,
      createdAt: new Date().toISOString(),
    };
    const updated = [newComplaint, ...complaints];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return newComplaint;
  },

  /**
   * Update complaint status and admin notes.
   */
  updateComplaintStatus: async (
    societyId: string,
    complaintId: string,
    status: ComplaintStatus,
    adminNotes?: string,
  ): Promise<Complaint | null> => {
    const storageKey = `iverto_complaints_${societyId}`;
    const complaints = await societyAdminApi.getComplaints(societyId);
    let target: Complaint | null = null;
    const updated = complaints.map((c) => {
      if (c.id === complaintId) {
        target = {
          ...c,
          status,
          adminNotes: adminNotes !== undefined ? adminNotes : c.adminNotes,
          resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date().toISOString() : c.resolvedAt,
          updatedAt: new Date().toISOString(),
        };
        return target;
      }
      return c;
    });
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return target;
  },
};

export default societyAdminApi;

