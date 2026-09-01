import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SocietyAdminController } from './society-admin.controller';
import { DrizzleService } from '../../database/drizzle.service';
import { AuthService } from '../../modules/auth/auth.service';
import { StaffService } from '../../modules/staff/staff.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { NoticesService } from '../../modules/community/notices.service';
import { ComplaintsService } from '../../modules/community/complaints.service';
import { GatesService } from '../../modules/gates/gates.service';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';

describe('SocietyAdminController', () => {
  let controller: SocietyAdminController;
  let mockDb: any;
  let mockAuthService: any;
  let mockStaffService: any;
  let mockEntryEventsService: any;
  let mockNoticesService: any;
  let mockComplaintsService: any;
  let mockGatesService: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockAuthService = {
      login: jest.fn(),
      changePassword: jest.fn(),
    };

    mockStaffService = {
      listStaffBySociety: jest.fn(),
      createStaff: jest.fn(),
      listStaffByUnit: jest.fn(),
      assignStaffToUnit: jest.fn(),
      unassignStaffFromUnit: jest.fn(),
    };

    mockEntryEventsService = {
      listSocietyEntryEvents: jest.fn(),
    };

    mockNoticesService = {
      listBySociety: jest.fn(),
      create: jest.fn(),
      togglePin: jest.fn(),
      delete: jest.fn(),
    };

    mockComplaintsService = {
      listBySociety: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockGatesService = {
      listBySociety: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignGuardToGate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocietyAdminController],
      providers: [
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: StaffService,
          useValue: mockStaffService,
        },
        {
          provide: EntryEventsService,
          useValue: mockEntryEventsService,
        },
        {
          provide: NoticesService,
          useValue: mockNoticesService,
        },
        {
          provide: ComplaintsService,
          useValue: mockComplaintsService,
        },
        {
          provide: GatesService,
          useValue: mockGatesService,
        },
      ],
    })
      .overrideGuard(RbacScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SocietyAdminController>(SocietyAdminController);
  });

  describe('getDashboardStats', () => {
    it('should aggregate counts for units, staff, devices, and entries today', async () => {
      // 4 queries: units, staff, devices, entryEvents
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([{ count: '120' }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([{ count: '15' }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([{ count: '4' }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce([{ count: '350' }]),
        }),
      });

      const result = await controller.getDashboardStats('soc-1');

      expect(result).toEqual({
        totalUnits: 120,
        activeStaff: 15,
        totalDevices: 4,
        todayEntries: 350,
      });
    });
  });

  describe('createUser', () => {
    it('should throw BadRequestException if required fields missing', async () => {
      await expect(
        controller.createUser('soc-1', {
          email: '',
          phone: '',
          name: '',
          role: 'OWNER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if unit role is used without unitId', async () => {
      await expect(
        controller.createUser('soc-1', {
          email: 'owner@example.com',
          phone: '9876543210',
          name: 'Owner Name',
          role: 'OWNER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if unitId does not belong to society', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      await expect(
        controller.createUser('soc-1', {
          email: 'owner@example.com',
          phone: '9876543210',
          name: 'Owner Name',
          role: 'OWNER',
          unitId: 'unit-999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create resident user with temp password and unit membership', async () => {
      // 1. Verify unit
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ id: 'unit-1', societyId: 'soc-1' }]),
          }),
        }),
      });

      // 2. Select existing user (returns empty)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 3. Insert user
      const mockCreatedUser = {
        id: 'user-1',
        email: 'resident@example.com',
        phone: '9876543210',
        name: 'Resident One',
      };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockCreatedUser]),
        }),
      });

      // 4. Insert unit membership
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([{ id: 'mem-1' }]),
      });

      const result = await controller.createUser('soc-1', {
        email: 'resident@example.com',
        phone: '9876543210',
        name: 'Resident One',
        role: 'OWNER',
        unitId: 'unit-1',
      });

      expect(result.user.email).toBe('resident@example.com');
      expect(result.tempPassword).toBe('9876543210@iverto');
      expect(result.role).toBe('OWNER');
      expect(result.unitId).toBe('unit-1');
    });

    it('should create guard user with society role', async () => {
      // 1. Select existing user (returns empty)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      // 2. Insert user
      const mockGuard = {
        id: 'guard-1',
        email: 'guard@example.com',
        phone: '9123456780',
        name: 'Guard One',
      };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockGuard]),
        }),
      });

      // 3. Insert society role
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([{ id: 'soc-role-1' }]),
      });

      const result = await controller.createUser('soc-1', {
        email: 'guard@example.com',
        phone: '9123456780',
        name: 'Guard One',
        role: 'GUARD',
      });

      expect(result.user.email).toBe('guard@example.com');
      expect(result.role).toBe('GUARD');
      expect(result.tempPassword).toBe('9123456780@iverto');
    });
  });

  describe('units and buildings', () => {
    it('should list all units in society', async () => {
      const mockUnits = [{ id: 'u-1', unitNumber: '101', buildingName: 'Tower A' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          leftJoin: jest.fn().mockReturnValueOnce({
            where: jest.fn().mockResolvedValueOnce(mockUnits),
          }),
        }),
      });

      const result = await controller.listUnits('soc-1');
      expect(result).toEqual(mockUnits);
    });

    it('should list all buildings in society', async () => {
      const mockBuildings = [{ id: 'b-1', societyId: 'soc-1', name: 'Tower A' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockResolvedValueOnce(mockBuildings),
        }),
      });

      const result = await controller.listBuildings('soc-1');
      expect(result).toEqual(mockBuildings);
    });

    it('should create a building', async () => {
      const mockBuilding = { id: 'b-1', societyId: 'soc-1', name: 'Tower B' };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockBuilding]),
        }),
      });

      const result = await controller.createBuilding('soc-1', { name: 'Tower B' });
      expect(result).toEqual(mockBuilding);
    });

    it('should create a unit under a valid building', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ id: 'b-1' }]),
          }),
        }),
      });

      const mockUnit = { id: 'u-2', societyId: 'soc-1', buildingId: 'b-1', unitNumber: '202' };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockUnit]),
        }),
      });

      const result = await controller.createUnit('soc-1', {
        buildingId: 'b-1',
        unitNumber: '202',
      });

      expect(result).toEqual(mockUnit);
    });
  });

  describe('staff endpoints', () => {
    it('should list staff members', async () => {
      const mockStaffList = [{ id: 'st-1', name: 'Ramesh' }];
      mockStaffService.listStaffBySociety.mockResolvedValueOnce(mockStaffList);

      const result = await controller.listStaff('soc-1', 'ACTIVE');
      expect(result).toEqual(mockStaffList);
      expect(mockStaffService.listStaffBySociety).toHaveBeenCalledWith('soc-1', 'ACTIVE');
    });

    it('should create a staff member', async () => {
      const staffDto = { name: 'Ramesh', phone: '9876500000', staffType: 'MAID' };
      mockStaffService.createStaff.mockResolvedValueOnce({ id: 'st-1', ...staffDto });

      const result = await controller.createStaff('soc-1', staffDto);
      expect(result.id).toBe('st-1');
      expect(mockStaffService.createStaff).toHaveBeenCalledWith('soc-1', staffDto);
    });

    it('should update staff details', async () => {
      const updatedStaff = { id: 'st-1', name: 'Ramesh Kumar', status: 'ACTIVE' };
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([updatedStaff]),
          }),
        }),
      });

      const result = await controller.updateStaff('soc-1', 'st-1', { name: 'Ramesh Kumar' });
      expect(result).toEqual(updatedStaff);
    });
  });

  describe('staff-unit assignment', () => {
    const mockUnitLookup = (found: boolean) => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce(found ? [{ id: 'u-1' }] : []),
          }),
        }),
      });
    };

    it('should list staff assigned to a unit', async () => {
      mockUnitLookup(true);
      const mockAssigned = [{ staffId: 'st-1', name: 'Ramesh' }];
      mockStaffService.listStaffByUnit.mockResolvedValueOnce(mockAssigned);

      const result = await controller.listUnitStaff('soc-1', 'u-1');
      expect(result).toEqual(mockAssigned);
      expect(mockStaffService.listStaffByUnit).toHaveBeenCalledWith('u-1');
    });

    it('should assign staff to a unit within the admin\'s own society', async () => {
      mockUnitLookup(true);
      const mockAssignment = { id: 'assign-1', staffId: 'st-1', unitId: 'u-1' };
      mockStaffService.assignStaffToUnit.mockResolvedValueOnce(mockAssignment);

      const result = await controller.assignStaffToUnit('soc-1', 'st-1', 'u-1', { notify: true });
      expect(result).toEqual(mockAssignment);
      expect(mockStaffService.assignStaffToUnit).toHaveBeenCalledWith('st-1', 'u-1', true);
    });

    it('should unassign staff from a unit', async () => {
      mockUnitLookup(true);
      mockStaffService.unassignStaffFromUnit.mockResolvedValueOnce([{ id: 'assign-1' }]);

      const result = await controller.unassignStaffFromUnit('soc-1', 'st-1', 'u-1');
      expect(result).toEqual([{ id: 'assign-1' }]);
      expect(mockStaffService.unassignStaffFromUnit).toHaveBeenCalledWith('st-1', 'u-1');
    });

    it('should reject assigning staff to a unit outside the admin\'s society', async () => {
      mockUnitLookup(false);

      await expect(
        controller.assignStaffToUnit('soc-1', 'st-1', 'u-other-society', { notify: true }),
      ).rejects.toThrow(NotFoundException);
      expect(mockStaffService.assignStaffToUnit).not.toHaveBeenCalled();
    });
  });

  describe('notices', () => {
    it('should list society notices', async () => {
      const mockNotices = [{ id: 'not-1', title: 'AGM' }];
      mockNoticesService.listBySociety.mockResolvedValueOnce(mockNotices);

      const result = await controller.listNotices('soc-1');
      expect(result).toEqual(mockNotices);
      expect(mockNoticesService.listBySociety).toHaveBeenCalledWith('soc-1');
    });

    it('should create a notice, deriving author identity from the current user', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            limit: jest.fn().mockResolvedValueOnce([{ name: 'Priya Admin' }]),
          }),
        }),
      });
      const mockCreated = { id: 'not-1', title: 'AGM', body: 'Details' };
      mockNoticesService.create.mockResolvedValueOnce(mockCreated);

      const result = await controller.createNotice('soc-1', 'user-1', {
        title: 'AGM',
        body: 'Details',
      } as any);

      expect(result).toEqual(mockCreated);
      expect(mockNoticesService.create).toHaveBeenCalledWith(
        'soc-1',
        { title: 'AGM', body: 'Details' },
        { userId: 'user-1', name: 'Priya Admin', role: 'SOCIETY_ADMIN' },
      );
    });

    it('should throw BadRequestException if title or body missing', async () => {
      await expect(
        controller.createNotice('soc-1', 'user-1', { title: '', body: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should toggle notice pin state', async () => {
      const mockPinned = { id: 'not-1', isPinned: true };
      mockNoticesService.togglePin.mockResolvedValueOnce(mockPinned);

      const result = await controller.toggleNoticePin('soc-1', 'not-1');
      expect(result).toEqual(mockPinned);
    });

    it('should delete a notice', async () => {
      const mockDeleted = { id: 'not-1' };
      mockNoticesService.delete.mockResolvedValueOnce(mockDeleted);

      const result = await controller.deleteNotice('soc-1', 'not-1');
      expect(result).toEqual(mockDeleted);
    });
  });

  describe('complaints', () => {
    it('should list all complaints for the society', async () => {
      const mockComplaints = [{ id: 'cmp-1', title: 'Water leakage' }];
      mockComplaintsService.listBySociety.mockResolvedValueOnce(mockComplaints);

      const result = await controller.listComplaints('soc-1');
      expect(result).toEqual(mockComplaints);
      expect(mockComplaintsService.listBySociety).toHaveBeenCalledWith('soc-1');
    });

    it('should update a complaint status', async () => {
      const mockUpdated = { id: 'cmp-1', status: 'RESOLVED' };
      mockComplaintsService.updateStatus.mockResolvedValueOnce(mockUpdated);

      const result = await controller.updateComplaint('soc-1', 'cmp-1', { status: 'RESOLVED' });
      expect(result).toEqual(mockUpdated);
      expect(mockComplaintsService.updateStatus).toHaveBeenCalledWith('soc-1', 'cmp-1', {
        status: 'RESOLVED',
      });
    });

    it('should throw BadRequestException if status missing', async () => {
      await expect(
        controller.updateComplaint('soc-1', 'cmp-1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('logs and devices', () => {
    it('should fetch paginated society entry logs', async () => {
      const mockLogs = { items: [], total: 0, page: 1, limit: 50 };
      mockEntryEventsService.listSocietyEntryEvents.mockResolvedValueOnce(mockLogs);

      const result = await controller.getLogs('soc-1', '1', '50');
      expect(result).toEqual(mockLogs);
      expect(mockEntryEventsService.listSocietyEntryEvents).toHaveBeenCalledWith('soc-1', 1, 50);
    });

    it('should list devices for society', async () => {
      const mockDevices = [{ id: 'dev-1', serialNo: 'M50-001', gateName: 'Main Gate' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValueOnce({
          leftJoin: jest.fn().mockReturnValueOnce({
            where: jest.fn().mockResolvedValueOnce(mockDevices),
          }),
        }),
      });

      const result = await controller.listDevices('soc-1');
      expect(result).toEqual(mockDevices);
    });
  });

  describe('gates', () => {
    it('should list gates for society', async () => {
      const mockGates = [{ id: 'gate-1', name: 'Main Gate' }];
      mockGatesService.listBySociety.mockResolvedValueOnce(mockGates);

      const result = await controller.listGates('soc-1');
      expect(result).toEqual(mockGates);
      expect(mockGatesService.listBySociety).toHaveBeenCalledWith('soc-1');
    });

    it('should create a gate', async () => {
      const mockGate = { id: 'gate-1', name: 'Main Gate' };
      mockGatesService.create.mockResolvedValueOnce(mockGate);

      const result = await controller.createGate('soc-1', { name: 'Main Gate' });
      expect(result).toEqual(mockGate);
    });

    it('should throw BadRequestException creating a gate with no name', async () => {
      await expect(
        controller.createGate('soc-1', { name: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update a gate', async () => {
      const mockGate = { id: 'gate-1', name: 'Back Gate' };
      mockGatesService.update.mockResolvedValueOnce(mockGate);

      const result = await controller.updateGate('soc-1', 'gate-1', { name: 'Back Gate' });
      expect(result).toEqual(mockGate);
    });

    it('should delete a gate', async () => {
      const mockGate = { id: 'gate-1' };
      mockGatesService.delete.mockResolvedValueOnce(mockGate);

      const result = await controller.deleteGate('soc-1', 'gate-1');
      expect(result).toEqual(mockGate);
    });

    it('should assign a guard to a gate', async () => {
      const mockAssigned = { id: 'role-1', gateId: 'gate-1' };
      mockGatesService.assignGuardToGate.mockResolvedValueOnce(mockAssigned);

      const result = await controller.assignGuardGate('soc-1', 'user-1', { gateId: 'gate-1' });
      expect(result).toEqual(mockAssigned);
      expect(mockGatesService.assignGuardToGate).toHaveBeenCalledWith('soc-1', 'user-1', 'gate-1');
    });

    it('should unassign a guard from a gate', async () => {
      const mockUnassigned = { id: 'role-1', gateId: null };
      mockGatesService.assignGuardToGate.mockResolvedValueOnce(mockUnassigned);

      const result = await controller.assignGuardGate('soc-1', 'user-1', { gateId: null });
      expect(result).toEqual(mockUnassigned);
      expect(mockGatesService.assignGuardToGate).toHaveBeenCalledWith('soc-1', 'user-1', null);
    });
  });
});
