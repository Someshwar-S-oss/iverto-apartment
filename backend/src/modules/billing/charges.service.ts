import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { InvoicesService } from './invoices.service';
import { adhocCharges, buildings, chargeTypes, units, unitBillingPlans } from '../../database/schema';

export type ChargeCategory = 'MAINTENANCE' | 'UTILITY' | 'FINE' | 'AMENITY' | 'OTHER';
export type ChargeTiming = 'IMMEDIATE' | 'START_OF_MONTH';

export interface CreateAdhocChargeDto {
  title: string;
  amount: number;
  category?: ChargeCategory;
  timing: ChargeTiming;
  chargeTypeId?: string;
  dueDateOverride?: string;
  // Exactly one target selector — validated in create() below.
  unitIds?: string[];
  billingPlanId?: string;
  allUnitsInSociety?: boolean;
}

/**
 * Creates the individual/extra-charge/fine primitive against one or many units at once
 * (a single unit for a fine, every unit on a slab for a group utility charge, or every
 * unit in the society for a blanket one-off) — the "admin shouldn't have to create the
 * same bill for everyone separately" requirement.
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly invoicesService: InvoicesService,
  ) {}

  private async resolveTargetUnitIds(societyId: string, dto: CreateAdhocChargeDto): Promise<string[]> {
    const selectors = [dto.unitIds?.length, dto.billingPlanId, dto.allUnitsInSociety].filter(Boolean);
    if (selectors.length !== 1) {
      throw new BadRequestException('Specify exactly one of unitIds, billingPlanId, or allUnitsInSociety');
    }

    if (dto.allUnitsInSociety) {
      const rows = await this.drizzle.db.select({ id: units.id }).from(units).where(eq(units.societyId, societyId));
      return rows.map((r) => r.id);
    }

    if (dto.billingPlanId) {
      const rows = await this.drizzle.db
        .select({ id: unitBillingPlans.unitId })
        .from(unitBillingPlans)
        .innerJoin(units, eq(unitBillingPlans.unitId, units.id))
        .where(and(eq(units.societyId, societyId), eq(unitBillingPlans.billingPlanId, dto.billingPlanId)));
      return rows.map((r) => r.id);
    }

    const rows = await this.drizzle.db
      .select({ id: units.id })
      .from(units)
      .where(eq(units.societyId, societyId));
    const validIds = new Set(rows.map((r) => r.id));
    return (dto.unitIds || []).filter((id) => validIds.has(id));
  }

  async create(societyId: string, createdByUserId: string, dto: CreateAdhocChargeDto) {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');
    if (!['IMMEDIATE', 'START_OF_MONTH'].includes(dto.timing)) {
      throw new BadRequestException('timing must be IMMEDIATE or START_OF_MONTH');
    }

    if (dto.chargeTypeId) {
      const [chargeType] = await this.drizzle.db
        .select({ id: chargeTypes.id })
        .from(chargeTypes)
        .where(and(eq(chargeTypes.id, dto.chargeTypeId), eq(chargeTypes.societyId, societyId)))
        .limit(1);
      if (!chargeType) throw new NotFoundException(`Charge type ${dto.chargeTypeId} not found`);
    }

    const targetUnitIds = await this.resolveTargetUnitIds(societyId, dto);
    if (targetUnitIds.length === 0) {
      throw new BadRequestException('No matching units found for this charge');
    }

    const inserted = await this.drizzle.db
      .insert(adhocCharges)
      .values(
        targetUnitIds.map((unitId) => ({
          societyId,
          unitId,
          chargeTypeId: dto.chargeTypeId,
          title: dto.title.trim(),
          amount: dto.amount,
          category: dto.category || 'OTHER',
          timing: dto.timing,
          dueDateOverride: dto.dueDateOverride,
          createdByUserId,
        })),
      )
      .returning();

    // IMMEDIATE charges get their own standalone invoice right now; START_OF_MONTH ones
    // stay PENDING_GENERATION until the next monthly combine run picks them up.
    if (dto.timing === 'IMMEDIATE') {
      await Promise.all(inserted.map((charge) => this.invoicesService.generateImmediateForCharge(charge)));
      return this.drizzle.db
        .select()
        .from(adhocCharges)
        .where(eq(adhocCharges.batchId, inserted[0].batchId));
    }

    return inserted;
  }

  async list(societyId: string, filters: { unitId?: string; status?: string } = {}) {
    const conditions = [eq(adhocCharges.societyId, societyId)];
    if (filters.unitId) conditions.push(eq(adhocCharges.unitId, filters.unitId));
    if (filters.status) conditions.push(eq(adhocCharges.status, filters.status as any));

    return this.drizzle.db
      .select({
        id: adhocCharges.id,
        unitId: adhocCharges.unitId,
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
        title: adhocCharges.title,
        amount: adhocCharges.amount,
        category: adhocCharges.category,
        timing: adhocCharges.timing,
        status: adhocCharges.status,
        batchId: adhocCharges.batchId,
        createdAt: adhocCharges.createdAt,
      })
      .from(adhocCharges)
      .innerJoin(units, eq(adhocCharges.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .where(and(...conditions))
      .orderBy(desc(adhocCharges.createdAt));
  }

  async cancel(societyId: string, chargeId: string) {
    const [charge] = await this.drizzle.db
      .select()
      .from(adhocCharges)
      .where(and(eq(adhocCharges.id, chargeId), eq(adhocCharges.societyId, societyId)))
      .limit(1);
    if (!charge) throw new NotFoundException(`Charge ${chargeId} not found`);
    if (charge.status !== 'PENDING_GENERATION') {
      throw new BadRequestException('Only a charge that has not yet been billed can be cancelled');
    }

    const [updated] = await this.drizzle.db
      .update(adhocCharges)
      .set({ status: 'CANCELLED' })
      .where(eq(adhocCharges.id, chargeId))
      .returning();
    return updated;
  }
}
