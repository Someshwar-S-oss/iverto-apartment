export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type UnitRole = 'OWNER' | 'TENANT' | 'FAMILY';
export type SocietyRole = 'SOCIETY_ADMIN' | 'GUARD_SUPERVISOR' | 'GUARD';
export type DeviceVendor = 'M50' | 'ZKTECO' | 'ESSL' | 'MATRIX' | 'OTHER';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED';
export type StaffType = 'MAID' | 'COOK' | 'DRIVER' | 'NANNY' | 'OTHER';
export type StaffStatus = 'ACTIVE' | 'INACTIVE';
export type EventSource = 'M50_DEVICE' | 'GUARD_APP' | 'PASSCODE';
export type SubjectType = 'STAFF' | 'VISITOR' | 'DELIVERY' | 'RESIDENT';
export type Direction = 'IN' | 'OUT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'AUTO_APPROVED';
export type DeliveryPlatform = 'BLINKIT' | 'ZEPTO' | 'SWIGGY' | 'INSTAMART' | 'AMAZON' | 'FLIPKART' | 'OTHER';
export type DeliveryMode = 'ASK_ME' | 'LEAVE_AT_GATE' | 'ALLOW_TO_DOOR';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  isSuperadmin?: boolean;
  mustChangePassword?: boolean;
  status?: UserStatus;
  avatarKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  accessToken: string;
  mustChangePassword: boolean;
  user: User;
}

export type ContextType = 'UNIT' | 'SOCIETY' | 'GATE' | 'GLOBAL';

export interface AppContext {
  type: ContextType;
  id: string;
  label: string;
  role: string;
  unitId?: string;
  societyId?: string;
  gateId?: string;
  unitNumber?: string;
  buildingName?: string;
  societyName?: string;
  isPrimary?: boolean;
}

export interface UnitMembershipContext {
  id: string;
  unitId: string;
  role: UnitRole | string;
  isPrimary: boolean;
  unitNumber?: string;
  buildingId?: string;
  buildingName?: string;
  societyId: string;
  societyName?: string;
}

export interface SocietyRoleContext {
  id: string;
  societyId: string;
  role: SocietyRole | string;
  societyName?: string;
}

export interface RawUserContextsResponse {
  units: UnitMembershipContext[];
  societies: SocietyRoleContext[];
}

export interface Society {
  id: string;
  name: string;
  timezone: string;
  address?: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
  updatedAt?: string;
}

export interface Device {
  id: string;
  societyId: string;
  gateId?: string | null;
  vendor: DeviceVendor;
  serialNo: string;
  name?: string | null;
  authToken?: string | null;
  status: DeviceStatus;
  lastSeenAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SuperadminAnalytics {
  totalSocieties: number;
  totalDevices: number;
  totalUsers: number;
  totalEntryEvents: number;
}

export interface SocietyDashboardStats {
  totalUnits: number;
  activeStaff: number;
  totalDevices: number;
  todayEntries: number;
}

export interface Unit {
  id: string;
  unitNumber: string;
  buildingId?: string | null;
  buildingName?: string | null;
  societyId: string;
}

export interface Building {
  id: string;
  societyId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Staff {
  id: string;
  societyId: string;
  name: string;
  phone: string;
  staffType: StaffType;
  photoData?: string | null;
  facePersonRef?: string | null;
  status: StaffStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface EntryEvent {
  id: string;
  societyId: string;
  gateId?: string | null;
  unitId?: string | null;
  visitorName?: string | null;
  visitorPhone?: string | null;
  subjectType: SubjectType;
  direction: Direction;
  source: EventSource;
  occurredAt: string;
  platform?: DeliveryPlatform | null;
  staffId?: string | null;
  approvalStatus?: ApprovalStatus | null;
  hasPhoto?: boolean;
  metadata?: Record<string, any>;
  createdAt?: string;
  unitNumber?: string;
  buildingName?: string;
  staffName?: string;
}

export interface Approval {
  id: string;
  entryEventId: string;
  unitId: string;
  status: ApprovalStatus;
  autoApprovedRule?: string | null;
  decideByUserId?: string | null;
  decidedAt?: string | null;
  validUntil: string;
  createdAt: string;
  entryEvent?: EntryEvent;
  visitorName?: string;
  visitorPhone?: string;
  subjectType?: SubjectType;
  platform?: DeliveryPlatform;
  unitNumber?: string;
  buildingName?: string;
}

export interface Passcode {
  id: string;
  unitId: string;
  createdByUserId: string;
  code: string;
  validFrom: string;
  validUntil: string;
  maxUses: number;
  usesCount: number;
  revoked: boolean;
  createdAt: string;
}

export interface DeliveryPermission {
  id: string;
  unitId: string;
  platform: DeliveryPlatform;
  mode: DeliveryMode;
  windowStart?: string | null;
  windowEnd?: string | null;
  silent?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResidentDirectoryItem {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export interface UnitDirectoryItem {
  unitId: string;
  unitNumber: string;
  buildingId?: string;
  buildingName?: string;
  residents: ResidentDirectoryItem[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta?: PaginationMeta;
  total?: number;
  page?: number;
  limit?: number;
}
