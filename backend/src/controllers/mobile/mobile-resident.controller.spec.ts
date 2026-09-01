import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MobileResidentController } from './mobile-resident.controller';
import { DrizzleService } from '../../database/drizzle.service';
import { ApprovalsService } from '../../modules/approvals/approvals.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { StaffService } from '../../modules/staff/staff.service';
import { NoticesService } from '../../modules/community/notices.service';
import { ComplaintsService } from '../../modules/community/complaints.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';

describe('MobileResidentController', () => {
  let controller: MobileResidentController;
  let mockDb: any;
  let mockApprovalsService: any;
  let mockEntryEventsService: any;
  let mockStaffService: any;
  let mockNoticesService: any;
  let mockComplaintsService: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockApprovalsService = {
      listPendingByUnit: jest.fn(),
      decideApproval: jest.fn(),
    };

    mockEntryEventsService = {
      listUnitEntryEvents: jest.fn(),
    };

    mockStaffService = {
      listStaffByUnit: jest.fn(),
      listStaffBySociety: jest.fn(),
    };

    mockNoticesService = {
      listBySociety: jest.fn(),
    };

    mockComplaintsService = {
      listByUnit: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileResidentController],
      providers: [
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: ApprovalsService,
          useValue: mockApprovalsService,
        },
        {
          provide: EntryEventsService,
          useValue: mockEntryEventsService,
        },
        {
          provide: StaffService,
          useValue: mockStaffService,
        },
        {
          provide: NoticesService,
          useValue: mockNoticesService,
        },
        {
          provide: ComplaintsService,
          useValue: mockComplaintsService,
        },
        // These tests call controller methods directly, bypassing the HTTP/interceptor
        // pipeline entirely — IdempotencyInterceptor is never actually invoked here, but
        // Nest still needs to resolve it (it's referenced via @UseInterceptors on
        // decideApproval) to build the module's DI container at compile() time.
        IdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    })
      .overrideGuard(RbacScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MobileResidentController>(MobileResidentController);
  });

  describe('approvals', () => {
    it('should list pending approvals for unit', async () => {
      const mockPending = [{ id: 'app-1', status: 'PENDING' }];
      mockApprovalsService.listPendingByUnit.mockResolvedValueOnce(mockPending);

      const result = await controller.getPendingApprovals('u-1');
      expect(result).toEqual(mockPending);
      expect(mockApprovalsService.listPendingByUnit).toHaveBeenCalledWith('u-1');
    });

    it('should decide an approval (APPROVED/REJECTED)', async () => {
      const mockDecided = { id: 'app-1', status: 'APPROVED' };
      mockApprovalsService.decideApproval.mockResolvedValueOnce(mockDecided);

      const result = await controller.decideApproval('u-1', 'app-1', 'user-1', {
        decision: 'APPROVED',
      });

      expect(result).toEqual(mockDecided);
      expect(mockApprovalsService.decideApproval).toHaveBeenCalledWith('app-1', 'u-1', 'user-1', 'APPROVED');
    });

    it('should throw BadRequestException on invalid decision', async () => {
      await expect(
        controller.decideApproval('u-1', 'app-1', 'user-1', {
          decision: 'MAYBE' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('entry events logs', () => {
    it('should list unit entry logs', async () => {
      const mockLogs = { items: [], total: 0, page: 1, limit: 20 };
      mockEntryEventsService.listUnitEntryEvents.mockResolvedValueOnce(mockLogs);

      const result = await controller.getEntryEvents('u-1', '1', '20');
      expect(result).toEqual(mockLogs);
      expect(mockEntryEventsService.listUnitEntryEvents).toHaveBeenCalledWith('u-1', 1, 20);
    });
  });

  describe('staff operations', () => {
    it('should list assigned staff for unit (view-only, no assign/unassign methods exposed)', async () => {
      const mockStaff = [{ staffId: 'st-1', name: 'Ramesh' }];
      mockStaffService.listStaffByUnit.mockResolvedValueOnce(mockStaff);

      const result = await controller.getStaff('u-1');
      expect(result).toEqual(mockStaff);
      expect(mockStaffService.listStaffByUnit).toHaveBeenCalledWith('u-1');

      // Residents can no longer assign/unassign staff themselves — see rbac.constants.ts
      // (staff.assign@UNIT removed from OWNER/TENANT); that's a site-admin-only action now.
      expect((controller as any).assignStaff).toBeUndefined();
      expect((controller as any).unassignStaff).toBeUndefined();
    });
  });

  describe('notices', () => {
    it('should list society notices for the unit', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });
      const mockNotices = [{ id: 'not-1', title: 'Elevator Maintenance' }];
      mockNoticesService.listBySociety.mockResolvedValueOnce(mockNotices);

      const result = await controller.getNotices('u-1');
      expect(result).toEqual(mockNotices);
      expect(mockNoticesService.listBySociety).toHaveBeenCalledWith('soc-1');
    });
  });

  describe('complaints', () => {
    it('should list complaints for the unit', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });
      const mockComplaints = [{ id: 'cmp-1', title: 'Water leakage' }];
      mockComplaintsService.listByUnit.mockResolvedValueOnce(mockComplaints);

      const result = await controller.getComplaints('u-1');
      expect(result).toEqual(mockComplaints);
      expect(mockComplaintsService.listByUnit).toHaveBeenCalledWith('soc-1', 'u-1');
    });

    it('should raise a complaint for the unit', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ societyId: 'soc-1' }]),
          }),
        }),
      });
      const mockCreated = { id: 'cmp-1', title: 'Water leakage', unitId: 'u-1' };
      mockComplaintsService.create.mockResolvedValueOnce(mockCreated);

      const result = await controller.raiseComplaint('u-1', 'user-1', {
        title: 'Water leakage',
        description: 'Leaking under the sink',
      });

      expect(result).toEqual(mockCreated);
      expect(mockComplaintsService.create).toHaveBeenCalledWith('soc-1', 'u-1', 'user-1', {
        title: 'Water leakage',
        description: 'Leaking under the sink',
        unitId: 'u-1',
      });
    });

    it('should throw BadRequestException when raising a complaint without title/description', async () => {
      await expect(
        controller.raiseComplaint('u-1', 'user-1', { title: '', description: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('passcodes', () => {
    it('should create a passcode for unit', async () => {
      const validUntil = new Date(Date.now() + 86400000);
      const mockPasscode = {
        id: 'pass-1',
        unitId: 'u-1',
        code: '123456',
        validUntil,
      };

      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockPasscode]),
        }),
      });

      const result = await controller.createPasscode('u-1', 'user-1', {
        validUntil,
      });

      expect(result).toEqual(mockPasscode);
    });

    it('should list passcodes for unit', async () => {
      const mockPasscodes = [{ id: 'pass-1', code: '123456' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            orderBy: jest.fn().mockResolvedValueOnce(mockPasscodes),
          }),
        }),
      });

      const result = await controller.listPasscodes('u-1');
      expect(result).toEqual(mockPasscodes);
    });

    it('should revoke a passcode', async () => {
      const mockRevoked = { id: 'pass-1', revoked: true };
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockRevoked]),
          }),
        }),
      });

      const result = await controller.revokePasscode('u-1', 'pass-1');
      expect(result).toEqual(mockRevoked);
    });
  });

  describe('delivery permissions', () => {
    it('should get delivery permissions for unit', async () => {
      const mockPerms = [{ id: 'dp-1', platform: 'BLINKIT', mode: 'ALLOW_TO_DOOR' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockPerms),
        }),
      });

      const result = await controller.getDeliveryPermissions('u-1');
      expect(result).toEqual(mockPerms);
    });

    it('should update existing delivery permission', async () => {
      // 1. Select existing
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ id: 'dp-1', platform: 'BLINKIT' }]),
          }),
        }),
      });

      // 2. Update
      const mockUpdated = { id: 'dp-1', platform: 'BLINKIT', mode: 'LEAVE_AT_GATE' };
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockUpdated]),
          }),
        }),
      });

      const result = await controller.updateDeliveryPermission('u-1', 'BLINKIT', {
        mode: 'LEAVE_AT_GATE',
      });

      expect(result).toEqual(mockUpdated);
    });

    it('should insert new delivery permission if not existing', async () => {
      // 1. Select existing (none)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 2. Insert
      const mockCreated = { id: 'dp-2', platform: 'ZEPTO', mode: 'ALLOW_TO_DOOR' };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockCreated]),
        }),
      });

      const result = await controller.updateDeliveryPermission('u-1', 'ZEPTO', {
        mode: 'ALLOW_TO_DOOR',
      });

      expect(result).toEqual(mockCreated);
    });
  });
});
