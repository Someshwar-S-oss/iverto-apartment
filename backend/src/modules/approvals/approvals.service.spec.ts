import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApprovalsService } from './approvals.service';
import { DrizzleService } from '../../database/drizzle.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { approvalRequests } from '../../database/schema';

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return { ...actual, eq: jest.fn(actual.eq) };
});

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let mockDb: any;
  let mockRealtime: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn(),
    };

    mockRealtime = {
      emitToGate: jest.fn(),
      emitToUnit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtime,
        },
      ],
    }).compile();

    service = module.get<ApprovalsService>(ApprovalsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createApprovalRequest', () => {
    it('should insert and return a pending approval request with expiry', async () => {
      const entryEventId = 'entry-123';
      const unitId = 'unit-456';
      const mockApproval = {
        id: 'appr-1',
        entryEventId,
        unitId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 90000),
      };

      const returningMock = jest.fn().mockResolvedValue([mockApproval]);
      const valuesMock = jest.fn().mockReturnValue({ returning: returningMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      const result = await service.createApprovalRequest(entryEventId, unitId, 90);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          entryEventId,
          unitId,
          status: 'PENDING',
          expiresAt: expect.any(Date),
        }),
      );
      expect(result).toEqual(mockApproval);
    });
  });

  describe('decideApproval', () => {
    it('should ensure first decision wins, updates status, and broadcasts to gate and unit', async () => {
      const approvalId = 'appr-1';
      const userId = 'user-resident';
      const decision = 'APPROVED';

      const mockUpdatedApproval = {
        id: approvalId,
        entryEventId: 'entry-123',
        unitId: 'unit-456',
        status: 'APPROVED',
        decidedByUserId: userId,
        decidedAt: new Date(),
      };

      const mockEntry = {
        id: 'entry-123',
        gateId: 'gate-north',
        visitorName: 'John Doe',
        subjectType: 'VISITOR',
      };

      // Mock atomic update returning 1 row
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockUpdatedApproval]),
          }),
        }),
      });

      // Mock entryEvents lookup for gate broadcast
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockEntry]),
          }),
        }),
      });

      const result = await service.decideApproval(approvalId, 'unit-456', userId, decision);

      expect(result).toEqual(mockUpdatedApproval);
      expect(mockRealtime.emitToGate).toHaveBeenCalledWith(
        'gate-north',
        'approval.decided',
        expect.objectContaining({
          approvalId,
          entryEventId: 'entry-123',
          status: 'APPROVED',
          unitId: 'unit-456',
          visitorName: 'John Doe',
          subjectType: 'VISITOR',
          decidedByUserId: userId,
        }),
      );
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith(
        'unit-456',
        'approval.decided',
        expect.objectContaining({
          approvalId,
          entryEventId: 'entry-123',
          status: 'APPROVED',
          unitId: 'unit-456',
        }),
      );
    });

    it('should throw ConflictException if update returns 0 rows due to race condition or expiry', async () => {
      const approvalId = 'appr-1';
      const userId = 'user-resident-2';

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.decideApproval(approvalId, 'unit-456', userId, 'REJECTED'),
      ).rejects.toThrow(ConflictException);

      expect(mockRealtime.emitToGate).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUnit).not.toHaveBeenCalled();
    });

    it('should reject deciding an approval that belongs to a different unit (IDOR guard)', async () => {
      const setMock = jest.fn().mockReturnValue({
        // Simulates the real WHERE clause: the approval row exists and is PENDING, but
        // the unitId condition doesn't match, so the atomic update matches zero rows.
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      });
      mockDb.update.mockReturnValue({ set: setMock });

      await expect(
        service.decideApproval('appr-1', 'unit-not-mine', 'user-attacker', 'APPROVED'),
      ).rejects.toThrow(ConflictException);

      // The atomic WHERE clause must actually filter on the caller's authorized unit,
      // not just the approvalId/status — otherwise this is an IDOR waiting to happen.
      expect(eq).toHaveBeenCalledWith(approvalRequests.unitId, 'unit-not-mine');
      expect(mockRealtime.emitToGate).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUnit).not.toHaveBeenCalled();
    });
  });

  describe('listPendingByUnit', () => {
    it('should query pending unexpired approval requests for a unit, denormalized with visitor detail', async () => {
      const unitId = 'unit-456';
      const mockList = [
        {
          id: 'appr-1',
          unitId,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60000),
          visitorName: 'Siddharth Roy',
          visitorPhone: '+91 98223 44556',
          subjectType: 'VISITOR',
          platform: null,
          hasPhoto: true,
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockList),
            }),
          }),
        }),
      });

      const result = await service.listPendingByUnit(unitId);
      expect(result).toEqual(mockList);
    });
  });

  describe('listPendingByGate', () => {
    it('should query pending unexpired approval requests for a gate, flattened with unit number', async () => {
      const gateId = 'gate-north';
      const mockList = [
        {
          id: 'appr-1',
          entryEventId: 'entry-123',
          unitId: 'unit-1',
          status: 'PENDING',
          gateId,
          visitorName: 'Siddharth Roy',
          visitorPhone: '+91 98223 44556',
          subjectType: 'VISITOR',
          platform: null,
          hasPhoto: false,
          unitNumber: 'A-402',
          buildingName: 'Tower A',
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              leftJoin: jest.fn().mockReturnValue({
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue(mockList),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await service.listPendingByGate(gateId);
      expect(result).toEqual(mockList);
    });
  });
});
