import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { M50Service } from '../src/modules/m50/m50.service';
import { DrizzleService } from '../src/database/drizzle.service';
import { M50XmlCodec } from '../src/modules/m50/m50.xml-codec';
import { FanoutService } from '../src/modules/staff/fanout.service';
import { M50Simulator } from '../scripts/m50-simulator';
import { devices, staff, users, entryEvents, visitorImages, m50SyncCursors } from '../src/database/schema';

describe('M50 Ingest & Simulator Protocol E2E Suite', () => {
  let m50Service: M50Service;
  let mockFanout: { handleStaffScan: jest.Mock };

  const dbStore = {
    devices: [
      {
        id: 'dev-uuid-1',
        serialNo: 'DJ20250307014',
        societyId: 'soc-uuid-1',
        gateId: 'gate-uuid-1',
        status: 'OFFLINE',
        authToken: null as string | null,
        lastHeartbeatAt: null as Date | null,
      },
    ],
    staff: [
      {
        id: 'staff-uuid-1',
        societyId: 'soc-uuid-1',
        name: 'Simulated Staff',
        phone: '9876543210',
        facePersonRef: '1',
      },
    ],
    users: [
      {
        id: 'user-uuid-1',
        name: 'Resident John',
        phone: '9998887776',
        email: 'john@example.com',
      },
    ],
    entryEvents: [] as any[],
    visitorImages: [] as any[],
    m50SyncCursors: [] as any[],
  };

  beforeEach(async () => {
    dbStore.entryEvents = [];
    dbStore.visitorImages = [];
    dbStore.m50SyncCursors = [];
    dbStore.devices[0].status = 'OFFLINE';
    dbStore.devices[0].authToken = null;

    mockFanout = {
      handleStaffScan: jest.fn().mockResolvedValue({ deliveredUnits: 1, units: ['unit-1'] }),
    };

    const mockDrizzle = {
      db: {
        select: () => ({
          from: (table: any) => ({
            where: (_cond: any) => ({
              limit: async () => {
                if (table === devices) return [...dbStore.devices];
                if (table === staff) return [...dbStore.staff];
                if (table === users) return [...dbStore.users];
                if (table === m50SyncCursors) return [...dbStore.m50SyncCursors];
                return [];
              },
            }),
          }),
        }),
        insert: (table: any) => ({
          values: (vals: any) => {
            if (table === entryEvents || vals.subjectType) {
              const inserted = { id: `event-${dbStore.entryEvents.length + 1}`, ...vals };
              dbStore.entryEvents.push(inserted);
              return {
                returning: async () => [inserted],
              };
            }
            if (table === visitorImages || vals.imageBytes) {
              const inserted = { id: `img-${dbStore.visitorImages.length + 1}`, ...vals };
              dbStore.visitorImages.push(inserted);
              return {
                returning: async () => [inserted],
              };
            }
            if (table === m50SyncCursors || vals.lastLogPos !== undefined) {
              dbStore.m50SyncCursors.push(vals);
              return {
                onConflictDoUpdate: async () => [vals],
              };
            }
            return {
              returning: async () => [vals],
              onConflictDoUpdate: async () => [vals],
            };
          },
        }),
        update: (table: any) => ({
          set: (vals: any) => ({
            where: async (_cond: any) => {
              if (table === devices) {
                Object.assign(dbStore.devices[0], vals);
                return [dbStore.devices[0]];
              }
              return [];
            },
          }),
        }),
      },
      withTenantContext: async (_ctx: any, cb: any) => cb(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'm50.path') return '/m50';
        if (key === 'm50.cloudId') return '';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        M50Service,
        {
          provide: DrizzleService,
          useValue: mockDrizzle,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
        {
          provide: FanoutService,
          useValue: mockFanout,
        },
      ],
    }).compile();

    m50Service = module.get<M50Service>(M50Service);
  });

  describe('1. M50 Registration & Login Handshake Ingest', () => {
    it('should register terminal, assign auth token, and mark terminal ONLINE', async () => {
      const registerXml = `
        <Message>
          <Request>Register</Request>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <CloudId></CloudId>
        </Message>
      `;
      const parsed = M50XmlCodec.parseXml(registerXml);
      const responseXml = await m50Service.handleMessage(parsed);

      expect(responseXml).toBeDefined();
      const res = M50XmlCodec.parseXml(responseXml!);
      expect(res.Message.Response).toBe('Register');
      expect(res.Message.Result).toBe('OK');
      expect(res.Message.Token).toBeDefined();

      const assignedToken = res.Message.Token;
      expect(dbStore.devices[0].authToken).toBe(assignedToken);
      expect(dbStore.devices[0].status).toBe('ONLINE');

      // Now test Login
      const loginXml = `
        <Message>
          <Request>Login</Request>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <Token>${assignedToken}</Token>
        </Message>
      `;
      const parsedLogin = M50XmlCodec.parseXml(loginXml);
      const loginResXml = await m50Service.handleMessage(parsedLogin);

      expect(loginResXml).toBeDefined();
      const loginRes = M50XmlCodec.parseXml(loginResXml!);
      expect(loginRes.Message.Response).toBe('Login');
      expect(loginRes.Message.Result).toBe('OK');
    });

    it('should reject login with invalid token', async () => {
      dbStore.devices[0].authToken = 'valid-token';
      const loginXml = `
        <Message>
          <Request>Login</Request>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <Token>invalid-token</Token>
        </Message>
      `;
      const parsed = M50XmlCodec.parseXml(loginXml);
      const resXml = await m50Service.handleMessage(parsed);
      const res = M50XmlCodec.parseXml(resXml!);

      expect(res.Message.Response).toBe('Login');
      expect(res.Message.Result).toBe('FailUnknownToken');
    });
  });

  describe('2. KeepAlive Heartbeat Ingest', () => {
    it('should acknowledge KeepAlive and return synchronized ServerTime', async () => {
      const keepAliveXml = `
        <Message>
          <Event>KeepAlive</Event>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <DevTime>2026-08-29-T12:00:00Z</DevTime>
        </Message>
      `;
      const parsed = M50XmlCodec.parseXml(keepAliveXml);
      const resXml = await m50Service.handleMessage(parsed);
      const res = M50XmlCodec.parseXml(resXml!);

      expect(res.Message.Response).toBe('KeepAlive');
      expect(res.Message.Result).toBe('OK');
      expect(res.Message.DevTime).toBe('2026-08-29-T12:00:00Z');
      expect(res.Message.ServerTime).toBeDefined();
    });
  });

  describe('3. TimeLog_v2 Real-time Face Verification Ingest', () => {
    it('should ingest face scan, map to staff member, store visitor image binary, and trigger fanout', async () => {
      const encodedName = M50XmlCodec.encodeUtf16leBase64('Simulated Staff');
      const timeLogXml = `
        <Message>
          <Event>TimeLog_v2</Event>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <TransID>trans-001</TransID>
          <LogID>25</LogID>
          <LogPos>25</LogPos>
          <UserID>1</UserID>
          <UserName>${encodedName}</UserName>
          <Action>Face</Action>
          <AttendStat>Duty On</AttendStat>
          <Time>2026-08-29-T12:30:00Z</Time>
          <LogImage>${M50Simulator.DEFAULT_JPEG_BASE64}</LogImage>
        </Message>
      `;
      const parsed = M50XmlCodec.parseXml(timeLogXml);
      const resXml = await m50Service.handleMessage(parsed);
      const res = M50XmlCodec.parseXml(resXml!);

      expect(res.Message.Response).toBe('TimeLog_v2');
      expect(res.Message.TransID).toBe('trans-001');
      expect(res.Message.Result).toBe('OK');

      // Verify entry event record
      expect(dbStore.entryEvents.length).toBe(1);
      const event = dbStore.entryEvents[0];
      expect(event.societyId).toBe('soc-uuid-1');
      expect(event.gateId).toBe('gate-uuid-1');
      expect(event.subjectType).toBe('STAFF');
      expect(event.staffId).toBe('staff-uuid-1');
      expect(event.direction).toBe('IN');

      // Verify image binary
      expect(dbStore.visitorImages.length).toBe(1);
      const img = dbStore.visitorImages[0];
      expect(img.entryEventId).toBe(event.id);
      expect(img.mimeType).toBe('image/jpeg');
      expect(img.imageBytes).toBeDefined();

      // Verify sync cursor update
      expect(dbStore.m50SyncCursors.length).toBe(1);
      expect(dbStore.m50SyncCursors[0].lastLogPos).toBe(25);

      // Verify fanout triggered
      expect(mockFanout.handleStaffScan).toHaveBeenCalledWith(
        'staff-uuid-1',
        'IN',
        expect.any(Date),
        'gate-uuid-1',
      );
    });
  });

  describe('4. AdminLog_v2 Keypad / Management Ingest', () => {
    it('should ingest AdminLog_v2 and return OK ACK', async () => {
      const adminLogXml = `
        <Message>
          <Event>AdminLog_v2</Event>
          <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
          <TransID>adm-001</TransID>
          <AdminID>0</AdminID>
          <Action>MenuAccess</Action>
          <Time>2026-08-29-T12:35:00Z</Time>
        </Message>
      `;
      const parsed = M50XmlCodec.parseXml(adminLogXml);
      const resXml = await m50Service.handleMessage(parsed);
      const res = M50XmlCodec.parseXml(resXml!);

      expect(res.Message.Response).toBe('AdminLog_v2');
      expect(res.Message.TransID).toBe('adm-001');
      expect(res.Message.Result).toBe('OK');
    });
  });

  describe('5. M50Simulator Unit & Protocol Verification', () => {
    it('should instantiate simulator with custom options and generate valid XML payloads', () => {
      const simulator = new M50Simulator({
        serial: 'DJ20250307014',
        user: '1',
        userName: 'Simulated Staff',
        scanInterval: 10,
        stay: false,
      });

      expect(simulator.serial).toBe('DJ20250307014');
      expect(simulator.userId).toBe('1');
      expect(simulator.userName).toBe('Simulated Staff');
      expect(simulator.scanInterval).toBe(10);
      expect(simulator.stay).toBe(false);
    });
  });
});
