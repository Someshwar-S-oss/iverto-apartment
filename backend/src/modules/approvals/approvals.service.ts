import { ConflictException, Injectable } from '@nestjs/common';
import { eq, and, gt, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { approvalRequests, entryEvents, visitorImages, units, buildings } from '../../database/schema';
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
    expectedUnitId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    // Atomic single-winner update: only succeeds if status is still PENDING AND the
    // approval actually belongs to the unit the caller was authorized against. Without
    // the unitId condition here, RbacScopeGuard only proves the caller may act on
    // `expectedUnitId` — it says nothing about which unit `approvalId` belongs to, so a
    // resident of one unit could otherwise decide another unit's visitor approvals by
    // guessing/observing an approvalId (IDOR).
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
          eq(approvalRequests.unitId, expectedUnitId),
          eq(approvalRequests.status, 'PENDING'),
        ),
      )
      .returning();

    if (!result.length) {
      throw new ConflictException(
        'Approval request not found for this unit, already decided, or expired',
      );
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

  /**
   * Denormalizes the visitor's own entry-event detail directly onto each pending row —
   * the bare `approval_requests` row alone (id, status, deadline, entryEventId) gives a
   * resident nothing to decide from: no name, no number, no face. The gate's own queue
   * (listPendingByGate) already resolves this by nesting the entry event; here it's
   * flattened onto the row instead, matching the shape the socket's `approval.requested`
   * event has always sent (see decideApproval's eventPayload / entry-events.service.ts).
   */
  async listPendingByUnit(unitId: string) {
    const now = new Date();
    return this.drizzle.db
      .select({
        id: approvalRequests.id,
        entryEventId: approvalRequests.entryEventId,
        unitId: approvalRequests.unitId,
        status: approvalRequests.status,
        decidedByUserId: approvalRequests.decidedByUserId,
        decidedAt: approvalRequests.decidedAt,
        expiresAt: approvalRequests.expiresAt,
        createdAt: approvalRequests.createdAt,
        visitorName: entryEvents.visitorName,
        visitorPhone: entryEvents.visitorPhone,
        subjectType: entryEvents.subjectType,
        // Deliveries carry their platform inside rawPayload rather than a real column
        // (see entry-events.service.ts's createGuardEntry) — pulled out here the same
        // way, null for anything that isn't a delivery.
        platform: sql<string | null>`${entryEvents.rawPayload} ->> 'platform'`,
        hasPhoto: sql<boolean>`${visitorImages.id} is not null`,
      })
      .from(approvalRequests)
      .innerJoin(entryEvents, eq(approvalRequests.entryEventId, entryEvents.id))
      .leftJoin(visitorImages, eq(visitorImages.entryEventId, entryEvents.id))
      .where(
        and(
          eq(approvalRequests.unitId, unitId),
          eq(approvalRequests.status, 'PENDING'),
          gt(approvalRequests.expiresAt, now),
        ),
      );
  }

  /**
   * Flattened, matching listPendingByUnit's shape (see its doc comment) rather than the
   * `{approval, entryEvent}` nesting this used to return — this web app's own guard
   * kiosk (KioskPage.tsx) already reads `approval.unitNumber`, `approval.visitorName`,
   * etc. flat off each row, so the nested shape was quietly broken here too. `unitNumber`
   * (+ `buildingName`) is the new piece: the guard's queue previously gave only
   * `unitId`, and the flat number is the one thing a guard actually reads off the card —
   * without it the app fetched the whole gate directory just to look one up, once per
   * queue refresh with anything waiting.
   */
  async listPendingByGate(gateId: string) {
    const now = new Date();
    return this.drizzle.db
      .select({
        id: approvalRequests.id,
        entryEventId: approvalRequests.entryEventId,
        unitId: approvalRequests.unitId,
        status: approvalRequests.status,
        decidedByUserId: approvalRequests.decidedByUserId,
        decidedAt: approvalRequests.decidedAt,
        expiresAt: approvalRequests.expiresAt,
        createdAt: approvalRequests.createdAt,
        gateId: entryEvents.gateId,
        visitorName: entryEvents.visitorName,
        visitorPhone: entryEvents.visitorPhone,
        subjectType: entryEvents.subjectType,
        platform: sql<string | null>`${entryEvents.rawPayload} ->> 'platform'`,
        hasPhoto: sql<boolean>`${visitorImages.id} is not null`,
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
      })
      .from(approvalRequests)
      .innerJoin(entryEvents, eq(approvalRequests.entryEventId, entryEvents.id))
      .leftJoin(visitorImages, eq(visitorImages.entryEventId, entryEvents.id))
      .leftJoin(units, eq(approvalRequests.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .where(
        and(
          eq(entryEvents.gateId, gateId),
          eq(approvalRequests.status, 'PENDING'),
          gt(approvalRequests.expiresAt, now),
        ),
      );
  }
}
