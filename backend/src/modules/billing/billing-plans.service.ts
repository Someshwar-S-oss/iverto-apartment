import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { billingPlans, billingSettings, buildings, units, unitBillingPlans } from '../../database/schema';

export interface CreateBillingPlanDto {
  name: string;
  amount: number;
  description?: string;
}

export interface UpdateBillingPlanDto {
  name?: string;
  amount?: number;
  description?: string;
  isActive?: boolean;
}

export interface UpdateBillingSettingsDto {
  dueDayOfMonth?: number;
  reminderDaysBeforeDue?: number;
}

/** Fee-slab CRUD and the unit <-> slab assignment admin uses to group units for billing. */
@Injectable()
export class BillingPlansService {
  constructor(private readonly drizzle: DrizzleService) {}

  async list(societyId: string) {
    return this.drizzle.db.select().from(billingPlans).where(eq(billingPlans.societyId, societyId));
  }

  async create(societyId: string, dto: CreateBillingPlanDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');

    const [created] = await this.drizzle.db
      .insert(billingPlans)
      .values({ societyId, name: dto.name.trim(), amount: dto.amount, description: dto.description?.trim() })
      .returning();
    return created;
  }

  async update(societyId: string, planId: string, dto: UpdateBillingPlanDto) {
    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');
      updatePayload.amount = dto.amount;
    }
    if (dto.description !== undefined) updatePayload.description = dto.description?.trim();
    if (dto.isActive !== undefined) updatePayload.isActive = dto.isActive;

    const [updated] = await this.drizzle.db
      .update(billingPlans)
      .set(updatePayload)
      .where(and(eq(billingPlans.id, planId), eq(billingPlans.societyId, societyId)))
      .returning();

    if (!updated) throw new NotFoundException(`Billing plan ${planId} not found`);
    return updated;
  }

  /**
   * Bulk-assigns (or reassigns) a list of units to a slab in one call — the "group these
   * units into a bill slab" admin action. Each unit has at most one active slab, so
   * assigning a unit already on another plan just moves it (onConflictDoUpdate keyed on
   * unitId's unique constraint).
   */
  async assignUnits(societyId: string, planId: string, unitIds: string[]) {
    if (!unitIds?.length) throw new BadRequestException('unitIds must be a non-empty array');

    const [plan] = await this.drizzle.db
      .select({ id: billingPlans.id })
      .from(billingPlans)
      .where(and(eq(billingPlans.id, planId), eq(billingPlans.societyId, societyId)))
      .limit(1);
    if (!plan) throw new NotFoundException(`Billing plan ${planId} not found`);

    const validUnits = await this.drizzle.db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.societyId, societyId)));
    const validUnitIds = new Set(validUnits.map((u) => u.id));
    const targetUnitIds = unitIds.filter((id) => validUnitIds.has(id));

    if (targetUnitIds.length === 0) return [];

    const rows = await Promise.all(
      targetUnitIds.map((unitId) =>
        this.drizzle.db
          .insert(unitBillingPlans)
          .values({ unitId, billingPlanId: planId })
          .onConflictDoUpdate({
            target: unitBillingPlans.unitId,
            set: { billingPlanId: planId, assignedAt: new Date() },
          })
          .returning(),
      ),
    );

    return rows.flat();
  }

  async unassignUnit(societyId: string, unitId: string) {
    const [unit] = await this.drizzle.db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.societyId, societyId)))
      .limit(1);
    if (!unit) throw new NotFoundException(`Unit ${unitId} not found in society ${societyId}`);

    const deleted = await this.drizzle.db
      .delete(unitBillingPlans)
      .where(eq(unitBillingPlans.unitId, unitId))
      .returning({ id: unitBillingPlans.id });

    return { unassigned: deleted.length > 0 };
  }

  async listUnitAssignments(societyId: string) {
    return this.drizzle.db
      .select({
        unitId: units.id,
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
        billingPlanId: billingPlans.id,
        billingPlanName: billingPlans.name,
        billingPlanAmount: billingPlans.amount,
        assignedAt: unitBillingPlans.assignedAt,
      })
      .from(units)
      .leftJoin(unitBillingPlans, eq(units.id, unitBillingPlans.unitId))
      .leftJoin(billingPlans, eq(unitBillingPlans.billingPlanId, billingPlans.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .where(eq(units.societyId, societyId));
  }

  async getSettings(societyId: string) {
    const [existing] = await this.drizzle.db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.societyId, societyId))
      .limit(1);
    if (existing) return existing;

    const [created] = await this.drizzle.db
      .insert(billingSettings)
      .values({ societyId })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    const [row] = await this.drizzle.db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.societyId, societyId))
      .limit(1);
    return row;
  }

  async updateSettings(societyId: string, dto: UpdateBillingSettingsDto) {
    await this.getSettings(societyId);

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (dto.dueDayOfMonth !== undefined) {
      if (dto.dueDayOfMonth < 1 || dto.dueDayOfMonth > 28) {
        throw new BadRequestException('dueDayOfMonth must be between 1 and 28');
      }
      updatePayload.dueDayOfMonth = dto.dueDayOfMonth;
    }
    if (dto.reminderDaysBeforeDue !== undefined) {
      if (dto.reminderDaysBeforeDue < 0) throw new BadRequestException('reminderDaysBeforeDue cannot be negative');
      updatePayload.reminderDaysBeforeDue = dto.reminderDaysBeforeDue;
    }

    const [updated] = await this.drizzle.db
      .update(billingSettings)
      .set(updatePayload)
      .where(eq(billingSettings.societyId, societyId))
      .returning();
    return updated;
  }
}
