import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { buildings, complaints, units, users } from '../../database/schema';

export type ComplaintCategory =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'SECURITY'
  | 'PARKING'
  | 'NOISE'
  | 'CLEANLINESS'
  | 'LIFT_ELEVATOR'
  | 'OTHER';
export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface CreateComplaintDto {
  unitId: string;
  title: string;
  description: string;
  category?: ComplaintCategory;
  priority?: ComplaintPriority;
}

export interface UpdateComplaintStatusDto {
  status: ComplaintStatus;
  adminNotes?: string;
}

const complaintColumns = {
  id: complaints.id,
  societyId: complaints.societyId,
  unitId: complaints.unitId,
  unitNumber: units.unitNumber,
  buildingName: buildings.name,
  raisedByUserId: complaints.raisedByUserId,
  residentName: users.name,
  residentPhone: users.phone,
  title: complaints.title,
  description: complaints.description,
  category: complaints.category,
  priority: complaints.priority,
  status: complaints.status,
  adminNotes: complaints.adminNotes,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
  resolvedAt: complaints.resolvedAt,
};

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  // residentName/residentPhone come from a leftJoin (the raising user may since have
  // been removed, onDelete: 'set null'); normalize to the frontend's non-null contract
  // rather than letting a bare `null` reach `.toLowerCase()` calls there.
  private normalize<T extends { residentName: string | null }>(row: T) {
    return { ...row, residentName: row.residentName || 'Former Resident' };
  }

  /**
   * List every complaint raised in a society (society-admin helpdesk view).
   */
  async listBySociety(societyId: string) {
    const rows = await this.drizzle.db
      .select(complaintColumns)
      .from(complaints)
      .leftJoin(units, eq(complaints.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .leftJoin(users, eq(complaints.raisedByUserId, users.id))
      .where(eq(complaints.societyId, societyId))
      .orderBy(desc(complaints.createdAt));

    return rows.map((row) => this.normalize(row));
  }

  /**
   * List complaints raised from one specific unit (resident's own tickets).
   */
  async listByUnit(societyId: string, unitId: string) {
    const rows = await this.drizzle.db
      .select(complaintColumns)
      .from(complaints)
      .leftJoin(units, eq(complaints.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .leftJoin(users, eq(complaints.raisedByUserId, users.id))
      .where(and(eq(complaints.societyId, societyId), eq(complaints.unitId, unitId)))
      .orderBy(desc(complaints.createdAt));

    return rows.map((row) => this.normalize(row));
  }

  /**
   * Raise a complaint. societyId/unitId/raisedByUserId are derived server-side from the
   * authenticated resident's own unit — a resident can only ever raise a ticket against
   * their own flat, never an arbitrary unitId.
   */
  async create(societyId: string, unitId: string, raisedByUserId: string, data: CreateComplaintDto) {
    const [created] = await this.drizzle.db
      .insert(complaints)
      .values({
        societyId,
        unitId,
        raisedByUserId,
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category || 'OTHER',
        priority: data.priority || 'MEDIUM',
        status: 'OPEN',
      })
      .returning();

    this.logger.log(`Complaint ${created.id} raised for unit ${unitId} (society ${societyId})`);
    return created;
  }

  async updateStatus(societyId: string, complaintId: string, data: UpdateComplaintStatusDto) {
    const resolved = data.status === 'RESOLVED' || data.status === 'CLOSED';

    const updatePayload: Record<string, any> = {
      status: data.status,
      resolvedAt: resolved ? new Date() : null,
      updatedAt: new Date(),
    };
    if (data.adminNotes !== undefined) updatePayload.adminNotes = data.adminNotes;

    const [updated] = await this.drizzle.db
      .update(complaints)
      .set(updatePayload)
      .where(and(eq(complaints.id, complaintId), eq(complaints.societyId, societyId)))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Complaint ${complaintId} not found in society ${societyId}`);
    }

    return updated;
  }
}
