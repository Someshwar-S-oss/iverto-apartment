import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EntryEventsService,
  isWithinTimeWindow,
} from './entry-events.service';
import { DrizzleService } from '../../database/drizzle.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { VisitorImagesService } from '../media/visitor-images.service';
import { RbacService } from '../rbac/rbac.service';

describe('EntryEventsService', () => {
  let service: EntryEventsService;
  let mockDb: any;
  let mockRealtime: any;
  let mockNotifications: any;
  let mockApprovals: any;
  let mockVisitorImages: any;
  let mockRbac: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
    };

    mockRealtime = {
      emitToGate: jest.fn(),
      emitToUnit: jest.fn(),
    };

    mockNotifications = {
      sendNotificationToUnit: jest.fn().mockResolvedValue([]),
    };

    mockApprovals = {
      createApprovalRequest: jest.fn(),
    };

    mockVisitorImages = {
      saveImage: jest.fn().mockResolvedValue({ id: 'img-1' }),
      getImage: jest.fn(),
    };

    mockRbac = {
      assertPermission: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntryEventsService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb, withSystemContext: jest.fn((cb: any) => cb()) },
        },
        {
          provide: RealtimeGateway,
          useValue: mockRealtime,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
        {
          provide: ApprovalsService,
          useValue: mockApprovals,
        },
        {
          provide: VisitorImagesService,
          useValue: mockVisitorImages,
        },
        {
          provide: RbacService,
          useValue: mockRbac,
        },
      ],
    }).compile();

    service = module.get<EntryEventsService>(EntryEventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isWithinTimeWindow', () => {
    it('should return true if no window is set', () => {
      expect(isWithinTimeWindow(new Date(), null, null)).toBe(true);
    });

    it('should correctly check standard daytime window', () => {
      const d1 = new Date('2026-08-29T10:30:00'); // 10:30
      expect(isWithinTimeWindow(d1, '09:00', '18:00')).toBe(true);

      const d2 = new Date('2026-08-29T20:00:00'); // 20:00
      expect(isWithinTimeWindow(d2, '09:00', '18:00')).toBe(false);
    });

    it('should correctly check overnight window', () => {
      const d1 = new Date('2026-08-29T23:00:00'); // 23:00
      expect(isWithinTimeWindow(d1, '22:00', '06:00')).toBe(true);

      const d2 = new Date('2026-08-29T04:30:00'); // 04:30
      expect(isWithinTimeWindow(d2, '22:00', '06:00')).toBe(true);

      const d3 = new Date('2026-08-29T14:00:00'); // 14:00
      expect(isWithinTimeWindow(d3, '22:00', '06:00')).toBe(false);
    });
  });

  describe('createGuardEntry', () => {
    it('should handle VISITOR entry: logs entry, saves photo, creates pending approval, sends push & socket', async () => {
      const societyId = 'soc-1';
      const gateId = 'gate-1';
      const guardUserId = 'guard-1';
      const photoBuffer = Buffer.from('visitor-photo');

      const mockEntry = {
        id: 'entry-v1',
        societyId,
        gateId,
        unitId: 'unit-101',
        subjectType: 'VISITOR',
        visitorName: 'Jane Guest',
        visitorPhone: '9876543210',
      };

      const mockApproval = {
        id: 'appr-v1',
        entryEventId: 'entry-v1',
        unitId: 'unit-101',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 90000),
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockEntry]),
        }),
      });

      mockApprovals.createApprovalRequest.mockResolvedValue(mockApproval);

      const result = await service.createGuardEntry(societyId, gateId, guardUserId, {
        unitId: 'unit-101',
        visitorName: 'Jane Guest',
        visitorPhone: '9876543210',
        subjectType: 'VISITOR',
        photoBuffer,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockVisitorImages.saveImage).toHaveBeenCalledWith('entry-v1', photoBuffer, 'image/jpeg');
      expect(mockApprovals.createApprovalRequest).toHaveBeenCalledWith('entry-v1', 'unit-101', 90);
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith(
        'unit-101',
        'approval.requested',
        expect.objectContaining({
          approvalId: 'appr-v1',
          visitorName: 'Jane Guest',
        }),
      );
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-101',
        'VISITOR_APPROVAL',
        'Visitor Approval Request',
        expect.stringContaining('Jane Guest'),
        expect.any(Object),
        'entry-v1',
      );
      expect(result.autoApproved).toBe(false);
      expect(result.entryEvent).toEqual({ ...mockEntry, hasPhoto: true });
    });

    it('should handle DELIVERY entry with LEAVE_AT_GATE within window: auto-approves and notifies', async () => {
      const mockEntry = {
        id: 'entry-d1',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
      };

      const mockPerm = {
        id: 'perm-1',
        unitId: 'unit-101',
        platform: 'BLINKIT',
        mode: 'LEAVE_AT_GATE',
        windowStart: '00:00',
        windowEnd: '23:59',
        silent: false,
      };

      const mockAutoApproval = {
        id: 'appr-auto-1',
        entryEventId: 'entry-d1',
        unitId: 'unit-101',
        status: 'AUTO_APPROVED',
      };

      // 1. insert entryEvent
      // 2. insert approvalRequest (auto)
      let insertCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation(() => {
            insertCount++;
            if (insertCount === 1) return Promise.resolve([mockEntry]);
            return Promise.resolve([mockAutoApproval]);
          }),
        }),
      }));

      // delivery permission query
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPerm]),
          }),
        }),
      });

      const result = await service.createGuardEntry('soc-1', 'gate-1', 'guard-1', {
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
        platform: 'BLINKIT',
      });

      expect(result.autoApproved).toBe(true);
      expect(result.mode).toBe('LEAVE_AT_GATE');
      expect(mockRealtime.emitToGate).toHaveBeenCalledWith(
        'gate-1',
        'approval.decided',
        expect.objectContaining({
          status: 'AUTO_APPROVED',
          mode: 'LEAVE_AT_GATE',
        }),
      );
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith(
        'unit-101',
        'entry.delivery',
        expect.objectContaining({
          mode: 'LEAVE_AT_GATE',
          platform: 'BLINKIT',
        }),
      );
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-101',
        'DELIVERY_ARRIVED',
        'Delivery Arrived at Gate',
        expect.stringContaining('left at gate'),
        expect.any(Object),
        'entry-d1',
      );
    });

    it('should handle DELIVERY entry with ALLOW_TO_DOOR within window: auto-approves and notifies', async () => {
      const mockEntry = {
        id: 'entry-d2',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
      };

      const mockPerm = {
        id: 'perm-2',
        unitId: 'unit-101',
        platform: 'ZEPTO',
        mode: 'ALLOW_TO_DOOR',
        windowStart: '00:00',
        windowEnd: '23:59',
        silent: false,
      };

      const mockAutoApproval = {
        id: 'appr-auto-2',
        entryEventId: 'entry-d2',
        unitId: 'unit-101',
        status: 'AUTO_APPROVED',
      };

      let insertCount = 0;
      mockDb.insert.mockImplementation(() => ({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation(() => {
            insertCount++;
            if (insertCount === 1) return Promise.resolve([mockEntry]);
            return Promise.resolve([mockAutoApproval]);
          }),
        }),
      }));

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPerm]),
          }),
        }),
      });

      const result = await service.createGuardEntry('soc-1', 'gate-1', 'guard-1', {
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
        platform: 'ZEPTO',
      });

      expect(result.autoApproved).toBe(true);
      expect(result.mode).toBe('ALLOW_TO_DOOR');
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-101',
        'DELIVERY_ARRIVED',
        'Delivery Allowed to Door',
        expect.stringContaining('on the way to your door'),
        expect.any(Object),
        'entry-d2',
      );
    });

    it('should handle DELIVERY entry with ASK_ME mode: creates pending approval request', async () => {
      const mockEntry = {
        id: 'entry-d3',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
      };

      const mockPerm = {
        id: 'perm-3',
        unitId: 'unit-101',
        platform: 'SWIGGY',
        mode: 'ASK_ME',
      };

      const mockApproval = {
        id: 'appr-d3',
        entryEventId: 'entry-d3',
        unitId: 'unit-101',
        status: 'PENDING',
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockEntry]),
        }),
      });

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockPerm]),
          }),
        }),
      });

      mockApprovals.createApprovalRequest.mockResolvedValue(mockApproval);

      const result = await service.createGuardEntry('soc-1', 'gate-1', 'guard-1', {
        unitId: 'unit-101',
        subjectType: 'DELIVERY',
        platform: 'SWIGGY',
      });

      expect(result.autoApproved).toBe(false);
      expect(mockApprovals.createApprovalRequest).toHaveBeenCalledWith('entry-d3', 'unit-101', 90);
      expect(mockNotifications.sendNotificationToUnit).toHaveBeenCalledWith(
        'unit-101',
        'DELIVERY_APPROVAL',
        'Delivery Approval Request',
        expect.stringContaining('SWIGGY'),
        expect.any(Object),
        'entry-d3',
      );
    });
  });

  describe('verifyPasscode', () => {
    it('should verify valid passcode, increment uses, log entry, and emit events', async () => {
      const societyId = 'soc-1';
      const gateId = 'gate-1';
      const guardUserId = 'guard-1';
      const code = '123456';

      const mockPasscode = {
        id: 'passcode-1',
        unitId: 'unit-101',
        code: '123456',
        qrToken: '00000000-0000-0000-0000-000000000001',
        validFrom: new Date(Date.now() - 10000),
        validUntil: new Date(Date.now() + 60000),
        maxUses: 1,
        usesCount: 0,
        revoked: false,
      };

      const mockEntry = {
        id: 'entry-pass-1',
        societyId,
        gateId,
        unitId: 'unit-101',
        eventSource: 'PASSCODE',
        direction: 'IN',
        occurredAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ passcode: mockPasscode }]),
            }),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ ...mockPasscode, usesCount: 1 }]),
        }),
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockEntry]),
        }),
      });

      const result = await service.verifyPasscode(societyId, gateId, guardUserId, code);

      expect(result.verified).toBe(true);
      expect(result.unitId).toBe('unit-101');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith(
        'unit-101',
        'entry.passcode',
        expect.any(Object),
      );
      expect(mockRealtime.emitToGate).toHaveBeenCalledWith(
        'gate-1',
        'passcode.verified',
        expect.any(Object),
      );
    });

    // A verdict is not an authentication failure — see the doc comment on verifyPasscode.
    // All four rejection cases resolve with {verified: false, reason, message} at 200,
    // never throw/401, so a mistyped code can't sign the guard out mid-shift.

    it('should resolve {verified: false, reason: NOT_FOUND} if passcode not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await service.verifyPasscode('soc-1', 'gate-1', 'guard-1', 'invalid-code');
      expect(result).toEqual({
        verified: false,
        reason: 'NOT_FOUND',
        message: 'Invalid passcode or QR token',
      });
    });

    it('should resolve {verified: false, reason: REVOKED} if passcode is revoked', async () => {
      const mockPasscode = {
        id: 'passcode-revoked',
        unitId: 'unit-101',
        revoked: true,
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ passcode: mockPasscode }]),
            }),
          }),
        }),
      });

      const result = await service.verifyPasscode('soc-1', 'gate-1', 'guard-1', '123456');
      expect(result).toEqual({
        verified: false,
        reason: 'REVOKED',
        message: 'Passcode has been revoked',
      });
    });

    it('should resolve {verified: false, reason: USED_UP} if passcode usesCount >= maxUses', async () => {
      const mockPasscode = {
        id: 'passcode-used',
        unitId: 'unit-101',
        revoked: false,
        maxUses: 1,
        usesCount: 1,
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ passcode: mockPasscode }]),
            }),
          }),
        }),
      });

      const result = await service.verifyPasscode('soc-1', 'gate-1', 'guard-1', '123456');
      expect(result).toEqual({
        verified: false,
        reason: 'USED_UP',
        message: 'Passcode usage limit exceeded',
      });
    });

    it('should resolve {verified: false, reason: EXPIRED} if passcode is outside validity window', async () => {
      const mockPasscode = {
        id: 'passcode-expired',
        unitId: 'unit-101',
        revoked: false,
        maxUses: 5,
        usesCount: 0,
        validFrom: new Date(Date.now() - 100000),
        validUntil: new Date(Date.now() - 1000), // expired in past
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ passcode: mockPasscode }]),
            }),
          }),
        }),
      });

      const result = await service.verifyPasscode('soc-1', 'gate-1', 'guard-1', '123456');
      expect(result).toEqual({
        verified: false,
        reason: 'EXPIRED',
        message: 'Passcode is expired or not yet valid',
      });
    });

    it('should reject a passcode that belongs to a different society (cross-tenant guard)', async () => {
      // The join to `units` filters on the calling gate's societyId, so a passcode
      // issued in a different society never surfaces here even if the code matches.
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await service.verifyPasscode('soc-OTHER', 'gate-1', 'guard-1', '123456');
      expect(result).toEqual({
        verified: false,
        reason: 'NOT_FOUND',
        message: 'Invalid passcode or QR token',
      });
    });
  });

  describe('markExit', () => {
    it('should record an OUT entry event and emit notifications', async () => {
      const originalEntry = {
        id: 'entry-in-1',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'VISITOR',
        visitorName: 'Visitor Bob',
      };

      const exitEntry = {
        id: 'entry-out-1',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'VISITOR',
        direction: 'OUT',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([originalEntry]),
          }),
        }),
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([exitEntry]),
        }),
      });

      const result = await service.markExit('entry-in-1', 'soc-1', 'guard-1');

      expect(result).toEqual({ ...exitEntry, hasPhoto: false });
      expect(mockRealtime.emitToUnit).toHaveBeenCalledWith(
        'unit-101',
        'entry.exit',
        expect.any(Object),
      );
      expect(mockRealtime.emitToGate).toHaveBeenCalledWith(
        'gate-1',
        'entry.exit',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException if original entry event is not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(service.markExit('non-existent', 'soc-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the entry event belongs to a different society', async () => {
      const originalEntry = {
        id: 'entry-in-1',
        societyId: 'soc-1',
        gateId: 'gate-1',
        unitId: 'unit-101',
        subjectType: 'VISITOR',
        visitorName: 'Visitor Bob',
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([originalEntry]),
          }),
        }),
      });

      // A guard authorized at a gate in 'soc-OTHER' must not be able to close out an
      // entry event that actually belongs to 'soc-1'.
      await expect(
        service.markExit('entry-in-1', 'soc-OTHER', 'guard-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // Both list queries below now leftJoin visitor_images for hasPhoto — the items query
  // chains through leftJoin, the plain count query doesn't, so `from()` returns an
  // object offering both and each call site uses only the one it actually needs.
  const mockListQuery = (mockItems: any[]) => {
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockItems),
              }),
            }),
          }),
        }),
        where: jest.fn().mockResolvedValue([{ count: 1 }]),
      }),
    }));
  };

  describe('listUnitEntryEvents & listSocietyEntryEvents', () => {
    it('should return paginated unit entry events', async () => {
      const mockItems = [{ id: 'entry-1', unitId: 'unit-101', hasPhoto: false }];
      mockListQuery(mockItems);

      const result = await service.listUnitEntryEvents('unit-101', 1, 20);

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should return paginated society entry events', async () => {
      const mockItems = [{ id: 'entry-1', societyId: 'soc-1', hasPhoto: true }];
      mockListQuery(mockItems);

      const result = await service.listSocietyEntryEvents('soc-1', 1, 50);

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });

  describe('listGateEntryEvents', () => {
    it('should return paginated gate entry events', async () => {
      const mockItems = [{ id: 'entry-1', gateId: 'gate-1', hasPhoto: false }];
      mockListQuery(mockItems);

      const result = await service.listGateEntryEvents('gate-1', 1, 20);

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should apply the open-only filter without throwing when open=true', async () => {
      const mockItems = [{ id: 'entry-1', gateId: 'gate-1', direction: 'IN', hasPhoto: false }];
      mockListQuery(mockItems);

      const result = await service.listGateEntryEvents('gate-1', 1, 20, true);

      expect(result.items).toEqual(mockItems);
    });
  });

  describe('getVisitorPhotoForUser', () => {
    const mockEntryRow = (overrides: Partial<{ unitId: string | null; societyId: string; gateId: string | null; guardUserId: string | null }> = {}) => ({
      unitId: 'unit-1',
      societyId: 'soc-1',
      gateId: 'gate-1',
      guardUserId: 'guard-9',
      ...overrides,
    });

    const mockSelectEntry = (row: any) => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(row ? [row] : []),
          }),
        }),
      });
    };

    it('should throw NotFoundException when the entry event does not exist', async () => {
      mockSelectEntry(undefined);

      await expect(
        service.getVisitorPhotoForUser('missing-evt', { sub: 'user-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow the guard who logged the entry to fetch the photo', async () => {
      mockSelectEntry(mockEntryRow());

      await service.getVisitorPhotoForUser('evt-1', { sub: 'guard-9' });

      expect(mockVisitorImages.getImage).toHaveBeenCalledWith('evt-1');
    });

    it('should allow a resident with entry.view@UNIT on the entry unit', async () => {
      mockSelectEntry(mockEntryRow());
      mockRbac.assertPermission.mockImplementation(
        async (_u: string, _a: string, scope: string, id: string) => scope === 'UNIT' && id === 'unit-1',
      );

      await service.getVisitorPhotoForUser('evt-1', { sub: 'resident-1' });

      expect(mockVisitorImages.getImage).toHaveBeenCalledWith('evt-1');
    });

    it('should allow a superadmin regardless of grants', async () => {
      mockSelectEntry(mockEntryRow());

      await service.getVisitorPhotoForUser('evt-1', { sub: 'root', isSuperadmin: true });

      expect(mockVisitorImages.getImage).toHaveBeenCalledWith('evt-1');
      expect(mockRbac.assertPermission).not.toHaveBeenCalled();
    });

    it('should reject an unrelated user with no grant on the unit, gate, or society', async () => {
      mockSelectEntry(mockEntryRow());
      mockRbac.assertPermission.mockResolvedValue(false);

      await expect(
        service.getVisitorPhotoForUser('evt-1', { sub: 'stranger-1' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockVisitorImages.getImage).not.toHaveBeenCalled();
    });
  });
});
