import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { chargeTypes } from '../../database/schema';

export type ChargeCategory = 'MAINTENANCE' | 'UTILITY' | 'FINE' | 'AMENITY' | 'OTHER';

export interface CreateChargeTypeDto {
  name: string;
  category?: ChargeCategory;
  defaultAmount?: number;
}

/**
 * Admin-managed catalog of reusable charge templates ("Water Tanker – ₹500") so raising an
 * ad hoc charge is picking from a list, not retyping a title/amount every time.
 */
@Injectable()
export class ChargeTypesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async list(societyId: string) {
    return this.drizzle.db.select().from(chargeTypes).where(eq(chargeTypes.societyId, societyId));
  }

  async create(societyId: string, dto: CreateChargeTypeDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');

    const [created] = await this.drizzle.db
      .insert(chargeTypes)
      .values({
        societyId,
        name: dto.name.trim(),
        category: dto.category || 'OTHER',
        defaultAmount: dto.defaultAmount,
      })
      .returning();
    return created;
  }

  async delete(societyId: string, chargeTypeId: string) {
    const deleted = await this.drizzle.db
      .delete(chargeTypes)
      .where(and(eq(chargeTypes.id, chargeTypeId), eq(chargeTypes.societyId, societyId)))
      .returning({ id: chargeTypes.id });

    if (deleted.length === 0) throw new NotFoundException(`Charge type ${chargeTypeId} not found`);
    return { deleted: true };
  }
}
