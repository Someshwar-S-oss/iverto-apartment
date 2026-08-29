import { Injectable, ConflictException } from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { approvalRequests, entryEvents } from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async createApprovalRequest(
    entryEventId: string,
    unitId: string,
    expiresInSeconds = 90,
  ) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const [approval] = await this.drizzle.db
      .insert(approvalRequests)
      .values({
        entryEventId,
        unitId,
        status: 'PENDING',
        expiresAt,
      })
      .returning();

    return approval;
  }

  async decideApproval(
    approvalId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    // Atomic single-winner update: only succeeds if status is still PENDING
    const result = await this.drizzle.db
      .update(approvalRequests)
      .set({
        status: decision,
        decidedByUserId: userId,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.status, 'PENDING'),
        ),
      )
      .returning();

    if (!result.length) {
      throw new ConflictException('Approval request already decided or expired');
    }

    const updated = result[0];

    // Fetch entry event details to inform gate
    const [entry] = await this.drizzle.db
      .select()
      .from(entryEvents)
      .where(eq(entryEvents.id, updated.entryEventId))
      .limit(1);

    const eventPayload = {
      approvalId: updated.id,
      entryEventId: updated.entryEventId,
      status: updated.status,
      unitId: updated.unitId,
      visitorName: entry?.visitorName,
      subjectType: entry?.subjectType,
      decidedByUserId: userId,
      decidedAt: updated.decidedAt,
    };

    if (entry && entry.gateId) {
      this.realtime.emitToGate(entry.gateId, 'approval.decided', eventPayload);
    }

    this.realtime.emitToUnit(updated.unitId, 'approval.decided', eventPayload);

    return updated;
  }

  async listPendingByUnit(unitId: string) {
    const now = new Date();
    return this.drizzle.db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.unitId, unitId),
          eq(approvalRequests.status, 'PENDING'),
          gt(approvalRequests.expiresAt, now),
        ),
      );
  }

  async listPendingByGate(gateId: string) {
    const now = new Date();
    return this.drizzle.db
      .select({
        approval: approvalRequests,
        entryEvent: entryEvents,
      })
      .from(approvalRequests)
      .innerJoin(entryEvents, eq(approvalRequests.entryEventId, entryEvents.id))
      .where(
        and(
          eq(entryEvents.gateId, gateId),
          eq(approvalRequests.status, 'PENDING'),
          gt(approvalRequests.expiresAt, now),
        ),
      );
  }
}
