import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, and, or, desc, count } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  entryEvents,
  approvalRequests,
  deliveryPermissions,
  passcodes,
} from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { VisitorImagesService } from '../media/visitor-images.service';

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

@Injectable()
export class EntryEventsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
    private readonly visitorImages: VisitorImagesService,
  ) {}

  async createGuardEntry(
    societyId: string,
    gateId: string,
    guardUserId: string,
    data: CreateGuardEntryDto,
  ) {
    const now = new Date();

    // 1. Insert entry event record
    const [entry] = await this.drizzle.db
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
        entry.id,
        data.photoBuffer,
        data.mimeType || 'image/jpeg',
      );
    }

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

    const condition = isUuid
      ? or(eq(passcodes.qrToken, codeOrQrToken), eq(passcodes.code, codeOrQrToken))
      : eq(passcodes.code, codeOrQrToken);

    const [passcode] = await this.drizzle.db
      .select()
      .from(passcodes)
      .where(condition)
      .limit(1);

    if (!passcode) {
      throw new UnauthorizedException('Invalid passcode or QR token');
    }

    if (passcode.revoked) {
      throw new UnauthorizedException('Passcode has been revoked');
    }

    if (passcode.usesCount >= passcode.maxUses) {
      throw new UnauthorizedException('Passcode usage limit exceeded');
    }

    const now = new Date();
    if (now < passcode.validFrom || now > passcode.validUntil) {
      throw new UnauthorizedException('Passcode is expired or not yet valid');
    }

    // Increment usage count
    await this.drizzle.db
      .update(passcodes)
      .set({ usesCount: passcode.usesCount + 1 })
      .where(eq(passcodes.id, passcode.id));

    // Log entry event
    const [entry] = await this.drizzle.db
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
      await this.visitorImages.saveImage(entry.id, photoBuffer);
    }

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
      verified: true,
      entryEvent: entry,
      unitId: passcode.unitId,
    };
  }

  async markExit(entryEventId: string, guardUserId?: string) {
    const [original] = await this.drizzle.db
      .select()
      .from(entryEvents)
      .where(eq(entryEvents.id, entryEventId))
      .limit(1);

    if (!original) {
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

    return exitEvent;
  }

  async listUnitEntryEvents(unitId: string, page = 1, limit = 20) {
    const offset = Math.max(0, (page - 1) * limit);

    const items = await this.drizzle.db
      .select()
      .from(entryEvents)
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

  async listSocietyEntryEvents(societyId: string, page = 1, limit = 50) {
    const offset = Math.max(0, (page - 1) * limit);

    const items = await this.drizzle.db
      .select()
      .from(entryEvents)
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
}
