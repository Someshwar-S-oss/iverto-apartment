import apiClient from './client';
import type {
  Approval,
  DeliveryPlatform,
  EntryEvent,
  SubjectType,
  UnitDirectoryItem,
} from './types';

export interface CreateGuardEntryPayload {
  unitId?: string;
  visitorName?: string;
  visitorPhone?: string;
  subjectType: SubjectType;
  photoBase64?: string;
  mimeType?: string;
  platform?: DeliveryPlatform;
  staffId?: string;
}

export interface CreateGuardEntryResponse {
  entryEvent: EntryEvent;
  approval?: Approval | null;
  autoApproved?: boolean;
  message?: string;
}

export interface VerifyPasscodePayload {
  codeOrQrToken: string;
  photoBase64?: string;
  mimeType?: string;
}

export interface VerifyPasscodeResponse {
  valid: boolean;
  entryEvent?: EntryEvent;
  message?: string;
  passcode?: any;
}

export const guardApi = {
  /**
   * Search resident and unit directory at gate.
   * Calls GET /api/v1/mobile/gates/:gateId/directory?query=...
   */
  getDirectory: async (
    gateId: string,
    query?: string,
  ): Promise<UnitDirectoryItem[]> => {
    const params = query ? { query } : undefined;
    const response = await apiClient.get<UnitDirectoryItem[]>(
      `/api/v1/mobile/gates/${gateId}/directory`,
      { params },
    );
    return response.data;
  },

  /**
   * Register a visitor, delivery agent, resident, or staff entry at the gate.
   * Calls POST /api/v1/mobile/gates/:gateId/entry-events.
   */
  createEntry: async (
    gateId: string,
    data: CreateGuardEntryPayload,
  ): Promise<CreateGuardEntryResponse> => {
    const response = await apiClient.post<CreateGuardEntryResponse>(
      `/api/v1/mobile/gates/${gateId}/entry-events`,
      data,
    );
    return response.data;
  },

  /**
   * Validate a numeric passcode or scanned QR token at the security kiosk.
   * Calls POST /api/v1/mobile/gates/:gateId/passcodes/verify.
   */
  verifyPasscode: async (
    gateId: string,
    data: VerifyPasscodePayload,
  ): Promise<VerifyPasscodeResponse> => {
    const response = await apiClient.post<VerifyPasscodeResponse>(
      `/api/v1/mobile/gates/${gateId}/passcodes/verify`,
      data,
    );
    return response.data;
  },

  /**
   * Mark visitor or staff member as checked out / exited the society.
   * Calls POST /api/v1/mobile/gates/:gateId/entry-events/:entryEventId/exit.
   */
  markExit: async (
    gateId: string,
    entryEventId: string,
  ): Promise<EntryEvent> => {
    const response = await apiClient.post<EntryEvent>(
      `/api/v1/mobile/gates/${gateId}/entry-events/${entryEventId}/exit`,
    );
    return response.data;
  },

  /**
   * Retrieve currently pending resident approvals initiated from this gate.
   * Calls GET /api/v1/mobile/gates/:gateId/pending.
   */
  getPendingApprovals: async (gateId: string): Promise<Approval[]> => {
    const response = await apiClient.get<Approval[]>(
      `/api/v1/mobile/gates/${gateId}/pending`,
    );
    return response.data;
  },

  /**
   * Returns the direct streaming URL for a visitor's captured photo.
   */
  getVisitorPhotoUrl: (entryEventId: string): string => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    return `${baseUrl}/api/v1/mobile/entry-events/${entryEventId}/photo`;
  },
};

export default guardApi;
