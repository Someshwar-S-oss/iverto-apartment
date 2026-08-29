import { Injectable, Logger } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { staff, staffUnitAssignments } from '../../database/schema';

export interface CreateStaffDto {
  name: string;
  phone: string;
  staffType: 'MAID' | 'COOK' | 'DRIVER' | 'NANNY' | 'OTHER';
  facePersonRef?: string;
  photoData?: string;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  /**
   * Register a new staff member for a society.
   */
  async createStaff(societyId: string, data: CreateStaffDto) {
    const [created] = await this.drizzle.db
      .insert(staff)
      .values({
        societyId,
        name: data.name.trim(),
        phone: data.phone.trim(),
        staffType: data.staffType,
        facePersonRef: data.facePersonRef?.trim() || null,
        photoData: data.photoData || null,
        status: 'ACTIVE',
      })
      .returning();

    this.logger.log(`Created staff member ${created.name} (${created.id}) for society ${societyId}`);
    return created;
  }

  /**
   * Assign a staff member to a unit.
   * If an active assignment exists, updates the notify preference.
   */
  async assignStaffToUnit(staffId: string, unitId: string, notify: boolean = true) {
    const [existing] = await this.drizzle.db
      .select()
      .from(staffUnitAssignments)
      .where(
        and(
          eq(staffUnitAssignments.staffId, staffId),
          eq(staffUnitAssignments.unitId, unitId),
          isNull(staffUnitAssignments.activeTo),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.notify !== notify) {
        const [updated] = await this.drizzle.db
          .update(staffUnitAssignments)
          .set({ notify })
          .where(eq(staffUnitAssignments.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    const [assignment] = await this.drizzle.db
      .insert(staffUnitAssignments)
      .values({
        staffId,
        unitId,
        notify,
        activeFrom: new Date(),
        activeTo: null,
      })
      .returning();

    this.logger.log(`Assigned staff ${staffId} to unit ${unitId}`);
    return assignment;
  }

  /**
   * Unassign a staff member from a unit by setting activeTo to now.
   */
  async unassignStaffFromUnit(staffId: string, unitId: string) {
    const updated = await this.drizzle.db
      .update(staffUnitAssignments)
      .set({
        activeTo: new Date(),
      })
      .where(
        and(
          eq(staffUnitAssignments.staffId, staffId),
          eq(staffUnitAssignments.unitId, unitId),
          isNull(staffUnitAssignments.activeTo),
        ),
      )
      .returning();

    this.logger.log(`Unassigned staff ${staffId} from unit ${unitId}`);
    return updated;
  }

  /**
   * Update notification settings for an active unit assignment.
   */
  async updateUnitAssignment(staffId: string, unitId: string, notify: boolean) {
    const [updated] = await this.drizzle.db
      .update(staffUnitAssignments)
      .set({ notify })
      .where(
        and(
          eq(staffUnitAssignments.staffId, staffId),
          eq(staffUnitAssignments.unitId, unitId),
          isNull(staffUnitAssignments.activeTo),
        ),
      )
      .returning();

    return updated || null;
  }

  /**
   * List staff members registered under a society, optionally filtered by status.
   */
  async listStaffBySociety(societyId: string, status?: 'ACTIVE' | 'INACTIVE') {
    const conditions = [eq(staff.societyId, societyId)];
    if (status) {
      conditions.push(eq(staff.status, status));
    }

    return await this.drizzle.db
      .select()
      .from(staff)
      .where(and(...conditions));
  }

  /**
   * List all active staff assigned to a unit with assignment metadata.
   */
  async listStaffByUnit(unitId: string) {
    return await this.drizzle.db
      .select({
        assignmentId: staffUnitAssignments.id,
        staffId: staff.id,
        name: staff.name,
        phone: staff.phone,
        staffType: staff.staffType,
        photoData: staff.photoData,
        facePersonRef: staff.facePersonRef,
        status: staff.status,
        notify: staffUnitAssignments.notify,
        activeFrom: staffUnitAssignments.activeFrom,
      })
      .from(staffUnitAssignments)
      .innerJoin(staff, eq(staffUnitAssignments.staffId, staff.id))
      .where(
        and(
          eq(staffUnitAssignments.unitId, unitId),
          isNull(staffUnitAssignments.activeTo),
        ),
      );
  }

  /**
   * Lookup staff member by facePersonRef within a society.
   */
  async getStaffByFaceRef(societyId: string, facePersonRef: string) {
    const [found] = await this.drizzle.db
      .select()
      .from(staff)
      .where(
        and(
          eq(staff.societyId, societyId),
          eq(staff.facePersonRef, facePersonRef.trim()),
        ),
      )
      .limit(1);

    return found || null;
  }
}
