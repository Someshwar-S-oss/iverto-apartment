import { Test, TestingModule } from '@nestjs/testing';
import { FanoutService } from './fanout.service';
import { DrizzleService } from '../../database/drizzle.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

describe('FanoutService', () => {
  let service: FanoutService;
  let mockDb: any;
  let mockRealtime: any;
  let mockNotifications: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
    };

    mockRealtime = {
      emitToUnit: jest.fn(),
    };

    mockNotifications = {
      sendNotificationToUnit: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanoutService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtime,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
      ],
    }).compile();

    service = module.get<FanoutService>(FanoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleStaffScan', () => {
    it('should find all assigned units and trigger real-time & FCM notification dispatch on IN scan', async () => {
      const staffId = 'staff-123';
      const gateId = 'gate-main';
      const occurredAt = new Date('2026-08-29T10:00:00.000Z');

      const mockStaffMember = {
        id: staffId,
        name: 'Anita Devi',
        staffType: 'MAID',
        societyId: 'soc-1',
      };

      const mockAssignments = [
        { unitId: 'unit-101' },
        { unitId: 'unit-102' },
        { unitId: 'unit-205' },
      ];

      // Query 1: staff lookup
      // Query 2: active unit assignments with notify = true
      let queryCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) {
              return {
                limit: jest.fn().mockResolvedValue([mockStaffMember]),
              };
            }
            if (queryCount === 2) {
              return Promise.resolve(mockAssignments);
            }
            return Promise.resolve([]);
          }),
        }),
      }));

      const result = await service.handleStaffScan(staffId, 'IN', occurredAt, gateId);

      expect(result.deliveredUnits).toBe(3);
      expect(result.units).toEqual(['unit-101', 'unit-102', 'unit-205']);

      // Check RealtimeGateway emits
      expect(mockRealtime.emitToUnit).toHaveBeenCalledTimes(3);
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith('unit-101', 'staff.status', {
        staffId: 'staff-123',
        name: 'Anita Devi',
        type: 'MAID',
        direction: 'IN',
        occurredAt: '2026-08-29T10:00:00.000Z',
        gateId: 'gate-main',
      });
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith('unit-102', 'staff.status', expect.any(Object));
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith('unit-205', 'staff.status', expect.any(Object));

      // Check FCM Notification dispatches
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledTimes(3);
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-101',
        'STAFF_MOVEMENT',
        'Staff Arrival',
        'Anita Devi (MAID) has arrived at the society.',
        {
          staffId: 'staff-123',
          name: 'Anita Devi',
          staffType: 'MAID',
          direction: 'IN',
          occurredAt: '2026-08-29T10:00:00.000Z',
          gateId: 'gate-main',
        },
      );
    });

    it('should correctly format departure notifications on OUT scan', async () => {
      const staffId = 'staff-456';
      const occurredAt = new Date('2026-08-29T18:30:00.000Z');

      const mockStaffMember = {
        id: staffId,
        name: 'Rajesh Driver',
        staffType: 'DRIVER',
        societyId: 'soc-1',
      };

      const mockAssignments = [{ unitId: 'unit-301' }];

      let queryCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) {
              return {
                limit: jest.fn().mockResolvedValue([mockStaffMember]),
              };
            }
            return Promise.resolve(mockAssignments);
          }),
        }),
      }));

      const result = await service.handleStaffScan(staffId, 'OUT', occurredAt);

      expect(result.deliveredUnits).toBe(1);
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith('unit-301', 'staff.status', {
        staffId: 'staff-456',
        name: 'Rajesh Driver',
        type: 'DRIVER',
        direction: 'OUT',
        occurredAt: '2026-08-29T18:30:00.000Z',
      });

      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-301',
        'STAFF_MOVEMENT',
        'Staff Departure',
        'Rajesh Driver (DRIVER) has left the society.',
        {
          staffId: 'staff-456',
          name: 'Rajesh Driver',
          staffType: 'DRIVER',
          direction: 'OUT',
          occurredAt: '2026-08-29T18:30:00.000Z',
        },
      );
    });

    it('should return 0 deliveredUnits when staff member is not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await service.handleStaffScan('non-existent-staff', 'IN', new Date());

      expect(result).toEqual({ deliveredUnits: 0, units: [] });
      expect(mockRealtime.emitToUnit).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotificationToUnit).not.toHaveBeenCalled();
    });

    it('should return 0 deliveredUnits when staff has no active notify assignments', async () => {
      const mockStaffMember = {
        id: 'staff-789',
        name: 'Cook Kumar',
        staffType: 'COOK',
      };

      let queryCount = 0;
      mockDb.select.mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) {
              return {
                limit: jest.fn().mockResolvedValue([mockStaffMember]),
              };
            }
            return Promise.resolve([]);
          }),
        }),
      }));

      const result = await service.handleStaffScan('staff-789', 'IN', new Date());

      expect(result).toEqual({ deliveredUnits: 0, units: [] });
      expect(mockRealtime.emitToUnit).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotificationToUnit).not.toHaveBeenCalled();
    });
  });
});
