import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { gates, societyRoles } from '../../database/schema';

export interface CreateGateDto {
  name: string;
  description?: string;
}

export interface UpdateGateDto {
  name?: string;
  description?: string;
}

@Injectable()
export class GatesService {
  private readonly logger = new Logger(GatesService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  async listBySociety(societyId: string) {
    return this.drizzle.db
      .select()
      .from(gates)
      .where(eq(gates.societyId, societyId));
  }

  async create(societyId: string, data: CreateGateDto) {
    const [created] = await this.drizzle.db
      .insert(gates)
      .values({
        societyId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
      })
      .returning();

    this.logger.log(`Gate ${created.id} ("${created.name}") created for society ${societyId}`);
    return created;
  }

  async update(societyId: string, gateId: string, data: UpdateGateDto) {
    const updatePayload: Record<string, any> = {};
    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.description !== undefined) updatePayload.description = data.description?.trim() || null;

    const [updated] = await this.drizzle.db
      .update(gates)
      .set(updatePayload)
      .where(and(eq(gates.id, gateId), eq(gates.societyId, societyId)))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Gate ${gateId} not found in society ${societyId}`);
    }

    return updated;
  }

  /**
   * Deleting a gate doesn't delete the guards assigned to it — society_roles.gateId is
   * ON DELETE SET NULL, so they fall back to unrestricted (every gate in the society)
   * rather than being silently locked out. Devices pointed at the gate fall back the
   * same way (devices.gateId is also ON DELETE SET NULL).
   */
  async delete(societyId: string, gateId: string) {
    const [deleted] = await this.drizzle.db
      .delete(gates)
      .where(and(eq(gates.id, gateId), eq(gates.societyId, societyId)))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Gate ${gateId} not found in society ${societyId}`);
    }

    return deleted;
  }

  /**
   * Assign (or unassign, with gateId: null) a guard/guard-supervisor to one specific
   * gate. `gateId: null` restores the unrestricted "every gate in the society" default.
   */
  async assignGuardToGate(societyId: string, userId: string, gateId: string | null) {
    if (gateId) {
      const [gate] = await this.drizzle.db
        .select({ id: gates.id })
        .from(gates)
        .where(and(eq(gates.id, gateId), eq(gates.societyId, societyId)))
        .limit(1);

      if (!gate) {
        throw new NotFoundException(`Gate ${gateId} not found in society ${societyId}`);
      }
    }

    const [updated] = await this.drizzle.db
      .update(societyRoles)
      .set({ gateId })
      .where(
        and(
          eq(societyRoles.userId, userId),
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.active, true),
          or(eq(societyRoles.role, 'GUARD'), eq(societyRoles.role, 'GUARD_SUPERVISOR')),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(
        `No active GUARD/GUARD_SUPERVISOR role for user ${userId} in society ${societyId}`,
      );
    }

    return updated;
  }
}
