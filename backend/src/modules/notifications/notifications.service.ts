import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { deviceTokens, notifications, unitMemberships } from '../../database/schema';

// Which Android notification channel each push type buzzes through — the app creates
// these four (plus a `general` fallback) at sign-in. The channel, not anything the app's
// JS does on receipt, is what decides sound/vibration/heads-up for a push that arrives
// while backgrounded or killed: it's read natively by Firebase before a line of JS runs,
// via `remoteMessage.data["channelId"]` (see FirebaseNotificationTrigger.kt). Without it
// every push falls onto expo-notifications' own IMPORTANCE_HIGH fallback channel, which
// works but collapses the distinction §5.4 of the mobile API doc draws — a DELIVERY_SILENT
// would ring exactly as loudly as a visitor at the door. A type not listed here is left to
// that same client-side fallback rather than guessing, so a type added after an APK ships
// still shows up instead of being dropped.
const NOTIFICATION_CHANNEL_BY_TYPE: Record<string, string> = {
  VISITOR_APPROVAL: 'approvals',
  DELIVERY_APPROVAL: 'approvals',
  DELIVERY_ARRIVED: 'deliveries',
  DELIVERY_SILENT: 'deliveries-silent',
  STAFF_MOVEMENT: 'staff',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly drizzle: DrizzleService) {
    if (admin.apps.length === 0) {
      try {
        admin.initializeApp();
      } catch (err) {
        this.logger.warn('Firebase Admin app initialization skipped or failed:', err);
      }
    }
  }

  async registerDeviceToken(
    userId: string,
    fcmToken: string,
    platform: 'android' | 'ios' | 'web',
  ) {
    const [tokenRecord] = await this.drizzle.db
      .insert(deviceTokens)
      .values({
        userId,
        fcmToken,
        platform,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: deviceTokens.fcmToken,
        set: {
          userId,
          platform,
          updatedAt: new Date(),
        },
      })
      .returning();

    return tokenRecord;
  }

  /**
   * Removes a device token so this handset stops receiving pushes — sign-out on the app
   * side only ever stopped the app from *re-registering* (forgetPushRegistration in
   * lib/push.ts); nothing told the service to stop sending. A gate tablet handed to the
   * next shift, or a resident's phone that gets sold or wiped, kept receiving that gate's
   * traffic (or a household's visitor alerts, with names and door numbers) on a handset
   * that no longer belongs to whoever registered it. Scoped to the caller's own userId so
   * one account can't unregister a token it doesn't own; deleting a token nobody has (or
   * one already removed) is not an error — the end state is identical either way.
   */
  async unregisterDeviceToken(userId: string, fcmToken: string): Promise<{ deleted: boolean }> {
    const result = await this.drizzle.db
      .delete(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.fcmToken, fcmToken)))
      .returning({ id: deviceTokens.id });

    return { deleted: result.length > 0 };
  }

  async sendHighPriorityDataMessage(
    tokens: string[],
    data: Record<string, string> = {},
  ) {
    if (!tokens || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, responses: [] };
    }

    try {
      const stringifiedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        stringifiedData[key] = typeof value === 'string' ? value : String(value);
      }

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        data: stringifiedData,
        android: {
          priority: 'high',
        },
      });

      this.logger.log(`Sent ${response.successCount} push notifications (${response.failureCount} failed)`);
      return response;
    } catch (err) {
      this.logger.error('Failed to send FCM push', err);
      return { successCount: 0, failureCount: tokens.length, error: err };
    }
  }

  async sendNotificationToUser(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
    entryEventId?: string,
  ) {
    const payloadData: Record<string, any> = {
      ...data,
      type,
      ...(entryEventId ? { entryEventId } : {}),
    };

    const [savedNotification] = await this.drizzle.db
      .insert(notifications)
      .values({
        userId,
        title,
        body,
        data: payloadData,
      })
      .returning();

    const userTokens = await this.drizzle.db
      .select({ fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));

    const tokenList = userTokens.map((t) => t.fcmToken);
    if (tokenList.length > 0) {
      const channelId = NOTIFICATION_CHANNEL_BY_TYPE[type];
      const fcmData: Record<string, string> = {
        title,
        body,
        type,
        ...(entryEventId ? { entryEventId } : {}),
        ...(channelId ? { channelId } : {}),
      };
      for (const [k, v] of Object.entries(data)) {
        fcmData[k] = typeof v === 'string' ? v : String(v);
      }
      await this.sendHighPriorityDataMessage(tokenList, fcmData);
    }

    return savedNotification;
  }

  async sendNotificationToUnit(
    unitId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
    entryEventId?: string,
  ) {
    const members = await this.drizzle.db
      .select({ userId: unitMemberships.userId })
      .from(unitMemberships)
      .where(
        and(
          eq(unitMemberships.unitId, unitId),
          isNull(unitMemberships.activeTo),
        ),
      );

    // unitId is the important one of the three optional scope fields (see §5.4 of the
    // mobile API doc): a resident with two homes taps an alert and the app needs to know
    // which flat to switch to *before* opening the queue, or they land on whichever home
    // they were last acting as and read an empty queue as "the visitor is gone" — at the
    // exact moment it's counting down. Always known here, so always sent, without callers
    // having to remember to pass it themselves.
    const dataWithUnit = { ...data, unitId };

    const results: Array<typeof notifications.$inferSelect> = [];
    for (const member of members) {
      const res = await this.sendNotificationToUser(
        member.userId,
        type,
        title,
        body,
        dataWithUnit,
        entryEventId,
      );
      results.push(res);
    }

    return results;
  }
}
