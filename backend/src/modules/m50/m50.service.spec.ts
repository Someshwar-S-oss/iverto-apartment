import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { M50Service } from './m50.service';
import { DrizzleService } from '../../database/drizzle.service';
import { M50XmlCodec } from './m50.xml-codec';

describe('M50Service', () => {
  let service: M50Service;
  let mockDb: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'm50.cloudId') return '';
        if (key === 'm50.path') return '/m50';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        M50Service,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<M50Service>(M50Service);
  });

  describe('handleRegister', () => {
    it('should successfully register a provisioned device and return auth token', () => {
      const mockDevice = {
        id: 'dev-1',
        serialNo: 'DJ20250307014',
        societyId: 'soc-1',
        status: 'OFFLINE',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDevice]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ ...mockDevice, status: 'ONLINE' }]),
        }),
      });

      return service.handleRegister('DJ20250307014').then((resXml) => {
        const parsed = M50XmlCodec.parseXml(resXml);
        expect(parsed.Message.Response).toBe('Register');
        expect(parsed.Message.DeviceSerialNo).toBe('DJ20250307014');
        expect(parsed.Message.Result).toBe('OK');
        expect(parsed.Message.Token).toBeDefined();
        expect(parsed.Message.Token.length).toBeGreaterThan(10);
      });
    });

    it('should reject unprovisioned device serial number', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const resXml = await service.handleRegister('UNKNOWN_SERIAL');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('Register');
      expect(parsed.Message.Result).toBe('Fail');
    });

    it('should reject registration if CloudId does not match configured secret', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'm50.cloudId') return 'supersecretcloudid';
        return null;
      });

      const resXml = await service.handleRegister('DJ20250307014', 'wrongcloudid');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('Register');
      expect(parsed.Message.Result).toBe('Fail');
    });
  });

  describe('handleLogin', () => {
    it('should accept login for valid serial and matching token', async () => {
      const mockDevice = {
        id: 'dev-1',
        serialNo: 'DJ20250307014',
        authToken: 'valid-token-123',
        status: 'OFFLINE',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDevice]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ ...mockDevice, status: 'ONLINE' }]),
        }),
      });

      const resXml = await service.handleLogin('DJ20250307014', 'valid-token-123');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('Login');
      expect(parsed.Message.Result).toBe('OK');
    });

    it('should return FailUnknownToken if token does not match', async () => {
      const mockDevice = {
        id: 'dev-1',
        serialNo: 'DJ20250307014',
        authToken: 'valid-token-123',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockDevice]),
          }),
        }),
      });

      const resXml = await service.handleLogin('DJ20250307014', 'invalid-token');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('Login');
      expect(parsed.Message.Result).toBe('FailUnknownToken');
    });

    it('should return Fail if device is not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const resXml = await service.handleLogin('UNKNOWN_DEV', 'any-token');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('Login');
      expect(parsed.Message.Result).toBe('Fail');
    });
  });

  describe('handleKeepAlive', () => {
    it('should update last_heartbeat_at and respond with ServerTime sync', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      const resXml = await service.handleKeepAlive('DJ20250307014', '2026-08-28-T15:30:00Z');
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('KeepAlive');
      expect(parsed.Message.Result).toBe('OK');
      expect(parsed.Message.DevTime).toBe('2026-08-28-T15:30:00Z');
      expect(parsed.Message.ServerTime).toBeDefined();
    });
  });

  describe('handleTimeLog', () => {
    it('should ingest attendance scan, map to staff, and update sync cursor', async () => {
      const mockDevice = {
        id: 'dev-1',
        serialNo: 'DJ20250307014',
        societyId: 'soc-1',
        gateId: 'gate-1',
      };

      const mockStaff = {
        id: 'staff-1',
        societyId: 'soc-1',
        name: 'Jane Maid',
        phone: '9876543210',
        facePersonRef: '2',
      };

      const mockEntryEvent = {
        id: 'event-1',
        societyId: 'soc-1',
        gateId: 'gate-1',
        eventSource: 'M50_DEVICE',
        subjectType: 'STAFF',
        staffId: 'staff-1',
      };

      // Device lookup, Staff lookup
      let selectCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(async () => {
              selectCount++;
              if (selectCount === 1) return [mockDevice];
              if (selectCount === 2) return [mockStaff];
              return [];
            }),
          }),
        }),
      }));

      // Insert into entryEvents
      let insertCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockEntryEvent]),
          onConflictDoUpdate: jest.fn().mockResolvedValue([]),
        }),
      }));

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      const logPayload = {
        LogID: '24',
        Time: '2026-08-28-T15:30:00Z',
        UserID: '2',
        AttendStat: 'Duty On',
        TransID: 'trans-999',
        LogImage: Buffer.from('fake-jpeg-data').toString('base64'),
      };

      const resXml = await service.handleTimeLog('DJ20250307014', logPayload);
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('TimeLog_v2');
      expect(parsed.Message.TransID).toBe('trans-999');
      expect(parsed.Message.Result).toBe('OK');
    });

    it('should ingest scan and map to Resident User by phone if staff not found', async () => {
      const mockDevice = {
        id: 'dev-1',
        serialNo: 'DJ20250307014',
        societyId: 'soc-1',
        gateId: 'gate-1',
      };

      const mockUser = {
        id: 'user-1',
        name: 'Resident John',
        phone: '9998887776',
      };

      let selectCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(async () => {
              selectCount++;
              if (selectCount === 1) return [mockDevice];
              if (selectCount === 2) return []; // Staff not found
              if (selectCount === 3) return [mockUser]; // Resident found
              return [];
            }),
          }),
        }),
      }));

      mockDb.insert.mockImplementation(() => ({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'event-2' }]),
          onConflictDoUpdate: jest.fn().mockResolvedValue([]),
        }),
      }));

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      const logPayload = {
        LogID: '25',
        Time: '2026-08-28-T15:35:00Z',
        UserID: '9998887776',
        AttendStat: 'Duty On',
        TransID: 'trans-1000',
      };

      const resXml = await service.handleTimeLog('DJ20250307014', logPayload);
      const parsed = M50XmlCodec.parseXml(resXml);
      expect(parsed.Message.Response).toBe('TimeLog_v2');
      expect(parsed.Message.Result).toBe('OK');
    });
  });

  describe('handleMessage routing', () => {
    it('should route Register request correctly', async () => {
      jest.spyOn(service, 'handleRegister').mockResolvedValue('<Message><Response>Register</Response></Message>');

      const parsed = {
        Message: {
          Request: 'Register',
          DeviceSerialNo: 'DEV-1',
          CloudId: 'cid',
        },
      };

      const res = await service.handleMessage(parsed);
      expect(service.handleRegister).toHaveBeenCalledWith('DEV-1', 'cid');
      expect(res).toContain('Register');
    });

    it('should route Login request correctly', async () => {
      jest.spyOn(service, 'handleLogin').mockResolvedValue('<Message><Response>Login</Response></Message>');

      const parsed = {
        Message: {
          Request: 'Login',
          DeviceSerialNo: 'DEV-1',
          Token: 'tok-1',
        },
      };

      const res = await service.handleMessage(parsed);
      expect(service.handleLogin).toHaveBeenCalledWith('DEV-1', 'tok-1');
      expect(res).toContain('Login');
    });

    it('should route KeepAlive event correctly', async () => {
      jest.spyOn(service, 'handleKeepAlive').mockResolvedValue('<Message><Response>KeepAlive</Response></Message>');

      const parsed = {
        Message: {
          Event: 'KeepAlive',
          DeviceSerialNo: 'DEV-1',
          DevTime: '2026-08-28-T15:30:00Z',
        },
      };

      const res = await service.handleMessage(parsed);
      expect(service.handleKeepAlive).toHaveBeenCalledWith('DEV-1', '2026-08-28-T15:30:00Z');
      expect(res).toContain('KeepAlive');
    });

    it('should return null for malformed or missing Message object', async () => {
      expect(await service.handleMessage(null)).toBeNull();
      expect(await service.handleMessage({})).toBeNull();
    });
  });
});
