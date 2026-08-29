import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { deviceTokens, notifications, unitMemberships } from '../../database/schema';

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
      const fcmData: Record<string, string> = {
        title,
        body,
        type,
        ...(entryEventId ? { entryEventId } : {}),
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

    const results: Array<typeof notifications.$inferSelect> = [];
    for (const member of members) {
      const res = await this.sendNotificationToUser(
        member.userId,
        type,
        title,
        body,
        data,
        entryEventId,
      );
      results.push(res);
    }

    return results;
  }
}
