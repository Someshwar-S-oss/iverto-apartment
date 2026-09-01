import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, or, desc, count, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  entryEvents,
  approvalRequests,
  deliveryPermissions,
  passcodes,
  units,
  visitorImages,
} from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { VisitorImagesService } from '../media/visitor-images.service';
import { RbacService } from '../rbac/rbac.service';
import { ScopeType } from '../rbac/rbac.constants';

export interface RequestingUser {
  sub?: string;
  userId?: string;
  id?: string;
  isSuperadmin?: boolean;
}

export interface CreateGuardEntryDto {
  unitId?: string;
  visitorName?: string;
  visitorPhone?: string;
  subjectType: 'STAFF' | 'VISITOR' | 'DELIVERY' | 'RESIDENT';
  photoBuffer?: Buffer;
  mimeType?: string;
  platform?:
    | 'BLINKIT'
    | 'ZEPTO'
    | 'SWIGGY'
    | 'INSTAMART'
    | 'AMAZON'
    | 'FLIPKART'
    | 'OTHER';
  staffId?: string;
}

export function isWithinTimeWindow(
  now: Date,
  windowStart?: string | null,
  windowEnd?: string | null,
): boolean {
  if (!windowStart || !windowEnd) {
    return true;
  }

  const parseTimeToMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map((v) => parseInt(v, 10));
    return (hours || 0) * 60 + (minutes || 0);
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(windowStart);
  const endMinutes = parseTimeToMinutes(windowEnd);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight window (e.g. 22:00 to 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// Every column on entry_events, plus a computed hasPhoto — shared by all three list
// methods below (unit/gate/society) so a client never has to call
// GET /entry-events/:id/photo and read the 404 just to find out whether one exists
// (that status is also "no such event", so the two used to be indistinguishable).
const entryEventListColumns = {
  id: entryEvents.id,
  societyId: entryEvents.societyId,
  gateId: entryEvents.gateId,
  unitId: entryEvents.unitId,
  eventSource: entryEvents.eventSource,
  subjectType: entryEvents.subjectType,
  staffId: entryEvents.staffId,
  visitorName: entryEvents.visitorName,
  visitorPhone: entryEvents.visitorPhone,
  direction: entryEvents.direction,
  occurredAt: entryEvents.occurredAt,
  recordedAt: entryEvents.recordedAt,
  guardUserId: entryEvents.guardUserId,
  idempotencyKey: entryEvents.idempotencyKey,
  rawPayload: entryEvents.rawPayload,
  hasPhoto: sql<boolean>`${visitorImages.id} is not null`,
};

@Injectable()
export class EntryEventsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
    private readonly visitorImages: VisitorImagesService,
    private readonly rbac: RbacService,
  ) {}

  async createGuardEntry(
    societyId: string,
    gateId: string,
    guardUserId: string,
    data: CreateGuardEntryDto,
  ) {
    const now = new Date();

    // 1. Insert entry event record
    const [insertedEntry] = await this.drizzle.db
      .insert(entryEvents)
      .values({
        societyId,
        gateId,
        unitId: data.unitId,
        eventSource: 'GUARD_APP',
        subjectType: data.subjectType,
        staffId: data.staffId,
        visitorName: data.visitorName,
        visitorPhone: data.visitorPhone,
        direction: 'IN',
        occurredAt: now,
        guardUserId,
        rawPayload: data.platform ? { platform: data.platform } : null,
      })
      .returning();

    // 2. Save visitor photo if provided
    if (data.photoBuffer) {
      await this.visitorImages.saveImage(
        insertedEntry.id,
        data.photoBuffer,
        data.mimeType || 'image/jpeg',
      );
    }

    // Known at insert time — no need to query visitor_images back out.
    const entry = { ...insertedEntry, hasPhoto: Boolean(data.photoBuffer) };

    // 3. Handle DELIVERY subject type
    if (data.subjectType === 'DELIVERY' && data.unitId) {
      let matchingPerm: typeof deliveryPermissions.$inferSelect | undefined;

      if (data.platform) {
        const [perm] = await this.drizzle.db
          .select()
          .from(deliveryPermissions)
          .where(
            and(
              eq(deliveryPermissions.unitId, data.unitId),
              eq(deliveryPermissions.platform, data.platform),
            ),
          )
          .limit(1);

        matchingPerm = perm;
      }

      if (
        matchingPerm &&
        isWithinTimeWindow(now, matchingPerm.windowStart, matchingPerm.windowEnd)
      ) {
        if (matchingPerm.mode === 'LEAVE_AT_GATE') {
          // Auto-approve: Leave at gate
          const [approval] = await this.drizzle.db
            .insert(approvalRequests)
            .values({
              entryEventId: entry.id,
              unitId: data.unitId,
              status: 'AUTO_APPROVED',
              expiresAt: new Date(now.getTime() + 90 * 1000),
              decidedAt: now,
            })
            .returning();

          this.realtime.emitToGate(gateId, 'approval.decided', {
            approvalId: approval.id,
            entryEventId: entry.id,
            status: 'AUTO_APPROVED',
            mode: 'LEAVE_AT_GATE',
            unitId: data.unitId,
            visitorName: data.visitorName || data.platform,
          });

          this.realtime.emitToUnit(data.unitId, 'entry.delivery', {
            entryEventId: entry.id,
            mode: 'LEAVE_AT_GATE',
            platform: data.platform,
            autoApproved: true,
          });

          if (!matchingPerm.silent) {
            await this.notifications.sendNotificationToUnit(
              data.unitId,
              'DELIVERY_ARRIVED',
              'Delivery Arrived at Gate',
              `${data.platform || 'Delivery'} package left at gate as per your preference.`,
              {
                entryEventId: entry.id,
                platform: data.platform || '',
                mode: 'LEAVE_AT_GATE',
              },
              entry.id,
            );
          } else {
            // Silent notification data payload only
            await this.notifications.sendNotificationToUnit(
              data.unitId,
              'DELIVERY_SILENT',
              'Delivery at Gate',
              `${data.platform || 'Delivery'} package at gate.`,
              {
                entryEventId: entry.id,
                platform: data.platform || '',
                silent: 'true',
              },
              entry.id,
            );
          }

          return {
            entryEvent: entry,
            approvalRequest: approval,
            autoApproved: true,
            mode: 'LEAVE_AT_GATE',
          };
        } else if (matchingPerm.mode === 'ALLOW_TO_DOOR') {
          // Auto-approve: Allow to door
          const [approval] = await this.drizzle.db
            .insert(approvalRequests)
            .values({
              entryEventId: entry.id,
              unitId: data.unitId,
              status: 'AUTO_APPROVED',
              expiresAt: new Date(now.getTime() + 90 * 1000),
              decidedAt: now,
            })
            .returning();

          this.realtime.emitToGate(gateId, 'approval.decided', {
            approvalId: approval.id,
            entryEventId: entry.id,
            status: 'AUTO_APPROVED',
            mode: 'ALLOW_TO_DOOR',
            unitId: data.unitId,
            visitorName: data.visitorName || data.platform,
          });

          this.realtime.emitToUnit(data.unitId, 'entry.delivery', {
            entryEventId: entry.id,
            mode: 'ALLOW_TO_DOOR',
            platform: data.platform,
            autoApproved: true,
          });

          await this.notifications.sendNotificationToUnit(
            data.unitId,
            'DELIVERY_ARRIVED',
            'Delivery Allowed to Door',
            `${data.platform || 'Delivery'} partner is on the way to your door.`,
            {
              entryEventId: entry.id,
              platform: data.platform || '',
              mode: 'ALLOW_TO_DOOR',
            },
            entry.id,
          );

          return {
            entryEvent: entry,
            approvalRequest: approval,
            autoApproved: true,
            mode: 'ALLOW_TO_DOOR',
          };
        }
      }

      // ASK_ME or outside window or no rule: Create pending approval request (90s)
      const approval = await this.approvals.createApprovalRequest(
        entry.id,
        data.unitId,
        90,
      );

      this.realtime.emitToUnit(data.unitId, 'approval.requested', {
        approvalId: approval.id,
        entryEventId: entry.id,
        unitId: data.unitId,
        subjectType: 'DELIVERY',
        platform: data.platform,
        visitorName: data.visitorName || data.platform,
        expiresAt: approval.expiresAt,
      });

      await this.notifications.sendNotificationToUnit(
        data.unitId,
        'DELIVERY_APPROVAL',
        'Delivery Approval Request',
        `${data.platform || 'Delivery'} partner is at the gate. Approve entry?`,
        {
          approvalId: approval.id,
          entryEventId: entry.id,
          platform: data.platform || '',
          subjectType: 'DELIVERY',
        },
        entry.id,
      );

      return {
        entryEvent: entry,
        approvalRequest: approval,
        autoApproved: false,
      };
    }

    // 4. Handle VISITOR subject type
    if (data.subjectType === 'VISITOR' && data.unitId) {
      const approval = await this.approvals.createApprovalRequest(
        entry.id,
        data.unitId,
        90,
      );

      this.realtime.emitToUnit(data.unitId, 'approval.requested', {
        approvalId: approval.id,
        entryEventId: entry.id,
        unitId: data.unitId,
        subjectType: 'VISITOR',
        visitorName: data.visitorName,
        visitorPhone: data.visitorPhone,
        expiresAt: approval.expiresAt,
      });

      await this.notifications.sendNotificationToUnit(
        data.unitId,
        'VISITOR_APPROVAL',
        'Visitor Approval Request',
        `${data.visitorName || 'A visitor'} is at the gate. Approve entry?`,
        {
          approvalId: approval.id,
          entryEventId: entry.id,
          visitorName: data.visitorName || '',
          subjectType: 'VISITOR',
        },
        entry.id,
      );

      return {
        entryEvent: entry,
        approvalRequest: approval,
        autoApproved: false,
      };
    }

    // 5. Default return for RESIDENT / STAFF / unassigned entries
    return {
      entryEvent: entry,
      autoApproved: false,
    };
  }

  async verifyPasscode(
    societyId: string,
    gateId: string,
    guardUserId: string,
    codeOrQrToken: string,
    photoBuffer?: Buffer,
  ) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        codeOrQrToken,
      );

    const codeCondition = isUuid
      ? or(eq(passcodes.qrToken, codeOrQrToken), eq(passcodes.code, codeOrQrToken))
      : eq(passcodes.code, codeOrQrToken);

    // Join through to the unit's society so a passcode can only ever be verified by a
    // gate belonging to the same society it was issued in. Without this, a 6-digit code
    // (or its collision) from one society's unit could be redeemed at any other
    // society's gate, since `code` alone isn't unique across the whole table.
    const [row] = await this.drizzle.db
      .select({ passcode: passcodes })
      .from(passcodes)
      .innerJoin(units, eq(passcodes.unitId, units.id))
      .where(and(codeCondition, eq(units.societyId, societyId)))
      .limit(1);

    const passcode = row?.passcode;

    // A verdict is not an authentication failure — a mistyped 6-digit code used to
    // return 401, which every other client in this system treats as "sign out and
    // re-authenticate" (there's no refresh token). Returning 200 with the outcome in the
    // body instead means a guest fat-fingering a code no longer signs out the guard mid-
    // shift and takes the gate down for everyone behind them in the queue.
    if (!passcode) {
      return { verified: false as const, reason: 'NOT_FOUND' as const, message: 'Invalid passcode or QR token' };
    }

    if (passcode.revoked) {
      return { verified: false as const, reason: 'REVOKED' as const, message: 'Passcode has been revoked' };
    }

    if (passcode.usesCount >= passcode.maxUses) {
      return { verified: false as const, reason: 'USED_UP' as const, message: 'Passcode usage limit exceeded' };
    }

    const now = new Date();
    if (now < passcode.validFrom || now > passcode.validUntil) {
      return { verified: false as const, reason: 'EXPIRED' as const, message: 'Passcode is expired or not yet valid' };
    }

    // Increment usage count
    await this.drizzle.db
      .update(passcodes)
      .set({ usesCount: passcode.usesCount + 1 })
      .where(eq(passcodes.id, passcode.id));

    // Log entry event
    const [insertedEntry] = await this.drizzle.db
      .insert(entryEvents)
      .values({
        societyId,
        gateId,
        unitId: passcode.unitId,
        eventSource: 'PASSCODE',
        subjectType: 'VISITOR',
        direction: 'IN',
        occurredAt: now,
        guardUserId,
        rawPayload: { passcodeId: passcode.id },
      })
      .returning();

    if (photoBuffer) {
      await this.visitorImages.saveImage(insertedEntry.id, photoBuffer);
    }

    const entry = { ...insertedEntry, hasPhoto: Boolean(photoBuffer) };

    this.realtime.emitToUnit(passcode.unitId, 'entry.passcode', {
      entryEventId: entry.id,
      passcodeId: passcode.id,
      occurredAt: entry.occurredAt,
    });

    this.realtime.emitToGate(gateId, 'passcode.verified', {
      entryEventId: entry.id,
      unitId: passcode.unitId,
      passcodeId: passcode.id,
    });

    return {
      verified: true as const,
      entryEvent: entry,
      unitId: passcode.unitId,
    };
  }

  async markExit(entryEventId: string, societyId: string, guardUserId?: string) {
    const [original] = await this.drizzle.db
      .select()
      .from(entryEvents)
      .where(eq(entryEvents.id, entryEventId))
      .limit(1);

    if (!original) {
      throw new NotFoundException(`Entry event not found: ${entryEventId}`);
    }

    // RbacScopeGuard only proves the guard is authorized at *some* gate — without this
    // check a guard at one society's gate could close out (and silently notify) another
    // society's entry event just by knowing its id.
    if (original.societyId !== societyId) {
      throw new NotFoundException(`Entry event not found: ${entryEventId}`);
    }

    const now = new Date();
    const [exitEvent] = await this.drizzle.db
      .insert(entryEvents)
      .values({
        societyId: original.societyId,
        gateId: original.gateId,
        unitId: original.unitId,
        eventSource: 'GUARD_APP',
        subjectType: original.subjectType,
        staffId: original.staffId,
        visitorName: original.visitorName,
        visitorPhone: original.visitorPhone,
        direction: 'OUT',
        occurredAt: now,
        guardUserId,
        rawPayload: { originalEntryId: original.id },
      })
      .returning();

    if (original.unitId) {
      this.realtime.emitToUnit(original.unitId, 'entry.exit', {
        entryEventId: exitEvent.id,
        originalEntryId: original.id,
        visitorName: original.visitorName,
        occurredAt: now,
      });
    }

    if (original.gateId) {
      this.realtime.emitToGate(original.gateId, 'entry.exit', {
        entryEventId: exitEvent.id,
        originalEntryId: original.id,
        visitorName: original.visitorName,
        occurredAt: now,
      });
    }

    // An OUT row never carries a photo — no capture step in markExit's own flow — but
    // hasPhoto is always present on entry-event rows now (item 5), never omitted.
    return { ...exitEvent, hasPhoto: false };
  }

  async listUnitEntryEvents(unitId: string, page = 1, limit = 20) {
    const offset = Math.max(0, (page - 1) * limit);

    const items = await this.drizzle.db
      .select(entryEventListColumns)
      .from(entryEvents)
      .leftJoin(visitorImages, eq(visitorImages.entryEventId, entryEvents.id))
      .where(eq(entryEvents.unitId, unitId))
      .orderBy(desc(entryEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await this.drizzle.db
      .select({ count: count() })
      .from(entryEvents)
      .where(eq(entryEvents.unitId, unitId));

    return {
      items,
      total: Number(totalCount?.count || 0),
      page,
      limit,
    };
  }

  /**
   * The guard app's equivalent of listUnitEntryEvents — deletes the client's in-memory
   * per-device gate log (lib/gateSession.ts), which only ever existed because there was
   * no way to list what a gate had already logged: marking an exit needs an entry event
   * id, and closing the app lost every id logged before restart.
   *
   * `open: true` filters to IN rows with no matching OUT yet — the "still inside" list a
   * guard's home screen counts. A row is closed once an OUT row exists whose
   * `raw_payload.originalEntryId` points back at it (see markExit above); there's no FK
   * for that relationship (an OUT row is a new event, not an update to the IN row), so
   * this is a NOT EXISTS on the jsonb payload rather than a join.
   */
  async listGateEntryEvents(gateId: string, page = 1, limit = 20, open = false) {
    const offset = Math.max(0, (page - 1) * limit);

    const conditions = [eq(entryEvents.gateId, gateId)];
    if (open) {
      conditions.push(eq(entryEvents.direction, 'IN'));
      conditions.push(sql`not exists (
        select 1 from entry_events oe
        where oe.direction = 'OUT'
          and oe.raw_payload ->> 'originalEntryId' = entry_events.id::text
      )`);
    }

    const items = await this.drizzle.db
      .select(entryEventListColumns)
      .from(entryEvents)
      .leftJoin(visitorImages, eq(visitorImages.entryEventId, entryEvents.id))
      .where(and(...conditions))
      .orderBy(desc(entryEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await this.drizzle.db
      .select({ count: count() })
      .from(entryEvents)
      .where(and(...conditions));

    return {
      items,
      total: Number(totalCount?.count || 0),
      page,
      limit,
    };
  }

  async listSocietyEntryEvents(societyId: string, page = 1, limit = 50) {
    const offset = Math.max(0, (page - 1) * limit);

    const items = await this.drizzle.db
      .select(entryEventListColumns)
      .from(entryEvents)
      .leftJoin(visitorImages, eq(visitorImages.entryEventId, entryEvents.id))
      .where(eq(entryEvents.societyId, societyId))
      .orderBy(desc(entryEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    const [totalCount] = await this.drizzle.db
      .select({ count: count() })
      .from(entryEvents)
      .where(eq(entryEvents.societyId, societyId));

    return {
      items,
      total: Number(totalCount?.count || 0),
      page,
      limit,
    };
  }

  /**
   * Fetches a visitor photo on behalf of a specific requesting user, enforcing that the
   * caller is actually entitled to see it. The `/entry-events/:id/photo` route has no
   * unit/society/gate in its URL to scope via RbacScopeGuard, so authorization has to be
   * resolved from the entry event's own tenancy instead of being skipped entirely.
   */
  async getVisitorPhotoForUser(entryEventId: string, user: RequestingUser) {
    // This route has no unitId/societyId/gateId in its URL for RbacScopeGuard to key
    // off, so RlsContextInterceptor never opens a tenant-scoped transaction for it —
    // entry_events/visitor_images are RLS-protected, so without an explicit context this
    // would just see zero rows. Authorization is fully re-derived below from the entry
    // event's own tenancy instead, matching what the RLS policy bypass is for.
    return this.drizzle.withSystemContext(async () => {
      const [entry] = await this.drizzle.db
        .select({
          unitId: entryEvents.unitId,
          societyId: entryEvents.societyId,
          gateId: entryEvents.gateId,
          guardUserId: entryEvents.guardUserId,
        })
        .from(entryEvents)
        .where(eq(entryEvents.id, entryEventId))
        .limit(1);

      if (!entry) {
        throw new NotFoundException(`Entry event not found: ${entryEventId}`);
      }

      const userId = user?.sub || user?.userId || user?.id;
      const isAuthorized =
        !!user?.isSuperadmin ||
        (!!userId && !!entry.guardUserId && entry.guardUserId === userId) ||
        (!!userId &&
          !!entry.unitId &&
          (await this.rbac.assertPermission(userId, 'entry.view', ScopeType.UNIT, entry.unitId))) ||
        (!!userId &&
          !!entry.gateId &&
          (await this.rbac.assertPermission(userId, 'entry.view', ScopeType.GATE, entry.gateId))) ||
        (!!userId &&
          (await this.rbac.assertPermission(userId, 'entry.view', ScopeType.SOCIETY, entry.societyId)));

      if (!isAuthorized) {
        throw new ForbiddenException('You do not have access to this visitor photo');
      }

      return this.visitorImages.getImage(entryEventId);
    });
  }
}
