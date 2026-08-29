import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { eq, and, or } from 'drizzle-orm';
import { WebSocket } from 'ws';
import { DrizzleService } from '../../database/drizzle.service';
import { devices, m50SyncCursors, staff, users, entryEvents, visitorImages } from '../../database/schema';
import { M50XmlCodec } from './m50.xml-codec';
import { FanoutService } from '../staff/fanout.service';

@Injectable()
export class M50Service {
  private readonly logger = new Logger(M50Service.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(forwardRef(() => FanoutService))
    private readonly fanoutService?: FanoutService,
  ) {}

  /**
   * Main entry point for routing decoded XML messages received from M50 terminals
   */
  async handleMessage(parsedXml: any, ws?: WebSocket): Promise<string | null> {
    const message = parsedXml?.Message;
    if (!message || typeof message !== 'object') {
      this.logger.warn('Received invalid XML message payload: missing <Message>');
      return null;
    }

    // Normalized tags (handling vendor typos like Reuqest)
    const requestType = message.Request || message.Reuqest;
    const eventType = message.Event;
    const responseType = message.Response;

    const deviceSerial = message.DeviceSerialNo ? String(message.DeviceSerialNo).trim() : '';

    if (requestType) {
      const req = String(requestType).trim();
      switch (req) {
        case 'Register':
          return this.handleRegister(deviceSerial, message.CloudId ? String(message.CloudId).trim() : undefined);
        case 'Login':
          return this.handleLogin(deviceSerial, message.Token ? String(message.Token).trim() : '');
        default:
          this.logger.debug(`Unhandled M50 Request: ${req}`);
          return null;
      }
    }

    if (eventType) {
      const evt = String(eventType).trim();
      switch (evt) {
        case 'KeepAlive':
          return this.handleKeepAlive(deviceSerial, message.DevTime ? String(message.DevTime).trim() : undefined);
        case 'TimeLog_v2':
        case 'TimeLog':
          return this.handleTimeLog(deviceSerial, message);
        case 'AdminLog_v2':
        case 'AdminLog':
          return this.handleAdminLog(deviceSerial, message);
        default:
          this.logger.debug(`Unhandled M50 Event: ${evt}`);
          return null;
      }
    }

    if (responseType) {
      this.logger.debug(`Received M50 Response for: ${responseType} from ${deviceSerial}`);
      return null;
    }

    return null;
  }

  /**
   * Handle Terminal Registration:
   * Verifies provisioned device, optional CloudId, and generates persistent auth token.
   */
  async handleRegister(deviceSerial: string, cloudId?: string): Promise<string> {
    if (!deviceSerial) {
      return M50XmlCodec.buildResponse('Register', { Result: 'Fail' });
    }

    const configuredCloudId = this.config.get<string>('m50.cloudId');
    if (configuredCloudId && configuredCloudId.trim() !== '') {
      if (!cloudId || cloudId !== configuredCloudId) {
        this.logger.warn(`Register rejected for device ${deviceSerial}: CloudId mismatch`);
        return M50XmlCodec.buildResponse('Register', {
          DeviceSerialNo: deviceSerial,
          Result: 'Fail',
        });
      }
    }

    const [device] = await this.drizzle.db
      .select()
      .from(devices)
      .where(eq(devices.serialNo, deviceSerial))
      .limit(1);

    if (!device) {
      this.logger.warn(`Register rejected for unprovisioned serial: ${deviceSerial}`);
      return M50XmlCodec.buildResponse('Register', {
        DeviceSerialNo: deviceSerial,
        Result: 'Fail',
      });
    }

    const token = randomUUID();

    await this.drizzle.db
      .update(devices)
      .set({
        authToken: token,
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      })
      .where(eq(devices.serialNo, deviceSerial));

    this.logger.log(`Device registered successfully: ${deviceSerial}`);

    return M50XmlCodec.buildResponse('Register', {
      DeviceSerialNo: deviceSerial,
      Token: token,
      Result: 'OK',
    });
  }

  /**
   * Handle Terminal Login:
   * Validates device registration and token credentials.
   */
  async handleLogin(deviceSerial: string, token: string): Promise<string> {
    if (!deviceSerial || !token) {
      return M50XmlCodec.buildResponse('Login', {
        DeviceSerialNo: deviceSerial || '',
        Result: 'Fail',
      });
    }

    const [device] = await this.drizzle.db
      .select()
      .from(devices)
      .where(eq(devices.serialNo, deviceSerial))
      .limit(1);

    if (!device) {
      this.logger.warn(`Login rejected for unknown serial: ${deviceSerial}`);
      return M50XmlCodec.buildResponse('Login', {
        DeviceSerialNo: deviceSerial,
        Result: 'Fail',
      });
    }

    if (!device.authToken || device.authToken !== token) {
      this.logger.warn(`Login rejected for ${deviceSerial}: FailUnknownToken`);
      return M50XmlCodec.buildResponse('Login', {
        DeviceSerialNo: deviceSerial,
        Result: 'FailUnknownToken',
      });
    }

    await this.drizzle.db
      .update(devices)
      .set({
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      })
      .where(eq(devices.serialNo, deviceSerial));

    this.logger.log(`Device logged in successfully: ${deviceSerial}`);

    return M50XmlCodec.buildResponse('Login', {
      DeviceSerialNo: deviceSerial,
      Result: 'OK',
    });
  }

  /**
   * Handle Heartbeat / KeepAlive:
   * Updates last heartbeat time and returns synced server clock.
   */
  async handleKeepAlive(deviceSerial: string, devTime?: string): Promise<string> {
    if (deviceSerial) {
      await this.drizzle.db
        .update(devices)
        .set({
          status: 'ONLINE',
          lastHeartbeatAt: new Date(),
        })
        .where(eq(devices.serialNo, deviceSerial));
    }

    const serverTime = M50XmlCodec.formatDeviceTime(new Date());

    return M50XmlCodec.buildResponse('KeepAlive', {
      Result: 'OK',
      DevTime: devTime || '',
      ServerTime: serverTime,
    });
  }

  /**
   * Handle Ingest of Real-time TimeLog_v2 attendance / access event:
   * Parses time, maps UserId to Staff or Resident User, persists EntryEvent and sync cursor.
   */
  async handleTimeLog(deviceSerial: string, log: any): Promise<string> {
    const transId = log.TransID ? String(log.TransID).trim() : '';

    if (!deviceSerial) {
      return M50XmlCodec.buildResponse('TimeLog_v2', {
        TransID: transId,
        Result: 'Fail',
      });
    }

    const [device] = await this.drizzle.db
      .select()
      .from(devices)
      .where(eq(devices.serialNo, deviceSerial))
      .limit(1);

    if (!device) {
      this.logger.error(`TimeLog rejected: device not found for serial ${deviceSerial}`);
      return M50XmlCodec.buildResponse('TimeLog_v2', {
        TransID: transId,
        Result: 'Fail',
      });
    }

    const timeStr = log.Time ? String(log.Time).trim() : '';
    const occurredAt = M50XmlCodec.parseDeviceTime(timeStr);
    const userIdStr = log.UserID != null ? String(log.UserID).trim() : '';
    const attendStat = log.AttendStat ? String(log.AttendStat).toLowerCase() : '';
    const logId = log.LogID ? parseInt(String(log.LogID), 10) : undefined;
    const logImage = log.LogImage ? String(log.LogImage).trim() : undefined;

    // Determine direction
    let direction: 'IN' | 'OUT' = 'IN';
    if (attendStat.includes('out') || attendStat.includes('duty off') || (log.Direction && String(log.Direction).toUpperCase() === 'OUT')) {
      direction = 'OUT';
    }

    let staffId: string | null = null;
    let subjectType: 'STAFF' | 'VISITOR' | 'DELIVERY' | 'RESIDENT' = 'STAFF';
    let visitorName: string | null = null;

    if (userIdStr === '0') {
      subjectType = 'STAFF';
      visitorName = 'Terminal Administrator';
    } else if (userIdStr) {
      // 1. Check staff table
      const [matchedStaff] = await this.drizzle.db
        .select()
        .from(staff)
        .where(
          and(
            eq(staff.societyId, device.societyId),
            or(eq(staff.facePersonRef, userIdStr), eq(staff.phone, userIdStr)),
          ),
        )
        .limit(1);

      if (matchedStaff) {
        staffId = matchedStaff.id;
        subjectType = 'STAFF';
        visitorName = matchedStaff.name;
      } else {
        // 2. Check users table
        const [matchedUser] = await this.drizzle.db
          .select()
          .from(users)
          .where(eq(users.phone, userIdStr))
          .limit(1);

        if (matchedUser) {
          subjectType = 'RESIDENT';
          visitorName = matchedUser.name;
        } else {
          subjectType = 'STAFF';
          visitorName = `User ${userIdStr}`;
        }
      }
    }

    try {
      const [insertedEvent] = await this.drizzle.db
        .insert(entryEvents)
        .values({
          societyId: device.societyId,
          gateId: device.gateId,
          eventSource: 'M50_DEVICE',
          subjectType,
          staffId,
          visitorName,
          direction,
          occurredAt,
          rawPayload: log,
        })
        .returning();

      if (logImage && insertedEvent) {
        try {
          const imageBuffer = Buffer.from(logImage, 'base64');
          await this.drizzle.db.insert(visitorImages).values({
            entryEventId: insertedEvent.id,
            imageBytes: imageBuffer,
            mimeType: 'image/jpeg',
            sizeBytes: imageBuffer.length,
          });
        } catch (imgErr) {
          this.logger.error('Failed to persist visitor image from LogImage', imgErr);
        }
      }

      // Fan-out staff arrival/departure notifications if staff member matched
      if (staffId && this.fanoutService) {
        try {
          await this.fanoutService.handleStaffScan(
            staffId,
            direction,
            occurredAt,
            device.gateId || undefined,
          );
        } catch (fanoutErr) {
          this.logger.error(`Failed to execute fanout for staff ${staffId}`, fanoutErr);
        }
      }

      // Update offline sync cursor
      const logPos = log.LogPos != null ? parseInt(String(log.LogPos), 10) : (logId ?? 0);
      await this.updateSyncCursor(deviceSerial, logPos, occurredAt);

      // Refresh device heartbeat
      await this.drizzle.db
        .update(devices)
        .set({
          status: 'ONLINE',
          lastHeartbeatAt: new Date(),
        })
        .where(eq(devices.serialNo, deviceSerial));

      return M50XmlCodec.buildResponse('TimeLog_v2', {
        TransID: transId,
        Result: 'OK',
      });
    } catch (err) {
      this.logger.error(`Error processing TimeLog for ${deviceSerial}`, err);
      return M50XmlCodec.buildResponse('TimeLog_v2', {
        TransID: transId,
        Result: 'Fail',
      });
    }
  }

  /**
   * Handle AdminLog_v2 keypad / management operations
   */
  async handleAdminLog(deviceSerial: string, log: any): Promise<string> {
    const transId = log.TransID ? String(log.TransID).trim() : '';
    this.logger.log(`AdminLog received from ${deviceSerial}: Action=${log.Action}, AdminID=${log.AdminID}`);

    if (deviceSerial) {
      await this.drizzle.db
        .update(devices)
        .set({
          status: 'ONLINE',
          lastHeartbeatAt: new Date(),
        })
        .where(eq(devices.serialNo, deviceSerial));
    }

    return M50XmlCodec.buildResponse('AdminLog_v2', {
      TransID: transId,
      Result: 'OK',
    });
  }

  /**
   * Retrieve offline sync cursor for a terminal
   */
  async getSyncCursor(serialNo: string) {
    const [cursor] = await this.drizzle.db
      .select()
      .from(m50SyncCursors)
      .where(eq(m50SyncCursors.serialNo, serialNo))
      .limit(1);

    return cursor || null;
  }

  /**
   * Upsert offline sync cursor position and timestamp
   */
  async updateSyncCursor(serialNo: string, lastLogPos: number, lastLogTime?: Date) {
    await this.drizzle.db
      .insert(m50SyncCursors)
      .values({
        serialNo,
        lastLogPos,
        lastLogTime: lastLogTime || new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: m50SyncCursors.serialNo,
        set: {
          lastLogPos,
          lastLogTime: lastLogTime || new Date(),
          updatedAt: new Date(),
        },
      });
  }
}
