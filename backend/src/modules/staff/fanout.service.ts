import { Injectable, Logger } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { staff, staffUnitAssignments } from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FanoutService {
  private readonly logger = new Logger(FanoutService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fan-out staff entry/exit scan event to all subscribed units via real-time WebSocket
   * and high-priority FCM push notifications.
   */
  async handleStaffScan(
    staffId: string,
    direction: 'IN' | 'OUT',
    occurredAt: Date,
    gateId?: string,
  ) {
    const [staffMember] = await this.drizzle.db
      .select()
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);

    if (!staffMember) {
      this.logger.warn(`Cannot fan-out scan: Staff ${staffId} not found`);
      return { deliveredUnits: 0, units: [] };
    }

    const assignments = await this.drizzle.db
      .select({ unitId: staffUnitAssignments.unitId })
      .from(staffUnitAssignments)
      .where(
        and(
          eq(staffUnitAssignments.staffId, staffId),
          eq(staffUnitAssignments.notify, true),
          isNull(staffUnitAssignments.activeTo),
        ),
      );

    if (!assignments.length) {
      this.logger.debug(`No active notification-enabled unit assignments found for staff ${staffId}`);
      return { deliveredUnits: 0, units: [] };
    }

    const occurredIso = occurredAt instanceof Date ? occurredAt.toISOString() : new Date(occurredAt).toISOString();
    const actionText = direction === 'IN' ? 'arrived at' : 'left';
    const directionTitle = direction === 'IN' ? 'Staff Arrival' : 'Staff Departure';
    const notificationBody = `${staffMember.name} (${staffMember.staffType}) has ${actionText} the society.`;

    const dispatchedUnitIds: string[] = [];

    for (const assignment of assignments) {
      const unitId = assignment.unitId;

      // 1. Dispatch Socket.IO real-time event to unit room
      // unitIds carries the room this event was emitted into — a client subscribed to
      // several rooms at once (resident + gate + society) otherwise has no way to tell
      // which one changed and has to refetch everything on every arrival/departure.
      this.realtime.emitToUnit(unitId, 'staff.status', {
        staffId: staffMember.id,
        name: staffMember.name,
        type: staffMember.staffType,
        direction,
        occurredAt: occurredIso,
        unitIds: [unitId],
        ...(gateId ? { gateId } : {}),
      });

      // 2. Dispatch high-priority FCM push notification to unit residents
      await this.notifications.sendNotificationToUnit(
        unitId,
        'STAFF_MOVEMENT',
        directionTitle,
        notificationBody,
        {
          staffId: staffMember.id,
          name: staffMember.name,
          staffType: staffMember.staffType,
          direction,
          occurredAt: occurredIso,
          societyId: staffMember.societyId,
          ...(gateId ? { gateId } : {}),
        },
      );

      dispatchedUnitIds.push(unitId);
    }

    this.logger.log(
      `Fan-out completed for staff ${staffMember.name} (${staffId}) - ${direction} to ${dispatchedUnitIds.length} units`,
    );

    return {
      deliveredUnits: dispatchedUnitIds.length,
      units: dispatchedUnitIds,
    };
  }
}
