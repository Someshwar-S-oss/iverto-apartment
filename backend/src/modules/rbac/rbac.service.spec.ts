import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RbacService } from './rbac.service';
import { DrizzleService } from '../../database/drizzle.service';
import { ScopeType } from './rbac.constants';

describe('RbacService', () => {
  let service: RbacService;
  let mockDrizzleService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'redis.url') return undefined; // local fallback
        return null;
      }),
    };

    mockDrizzleService = {
      db: {
        select: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('getUserContexts', () => {
    it('should return combined active unit memberships and society roles', async () => {
      const userId = 'user-123';

      const mockUnitRows = [
        {
          id: 'mem-1',
          unitId: 'unit-101',
          role: 'OWNER',
          isPrimary: true,
          unitNumber: 'A-101',
          buildingId: 'bld-1',
          buildingName: 'Tower A',
          societyId: 'soc-1',
          societyName: 'Palm Meadows',
        },
      ];

      const mockSocietyRows = [
        {
          id: 'soc-role-1',
          societyId: 'soc-1',
          role: 'SOCIETY_ADMIN',
          societyName: 'Palm Meadows',
        },
      ];

      // Setup Drizzle fluent mock for the two queries
      mockDrizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              leftJoin: jest.fn().mockReturnValue({
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue(mockUnitRows),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockSocietyRows),
            }),
          }),
        });

      const contexts = await service.getUserContexts(userId);

      expect(contexts.units).toHaveLength(1);
      expect(contexts.units[0]).toEqual({
        id: 'mem-1',
        unitId: 'unit-101',
        role: 'OWNER',
        isPrimary: true,
        unitNumber: 'A-101',
        buildingId: 'bld-1',
        buildingName: 'Tower A',
        societyId: 'soc-1',
        societyName: 'Palm Meadows',
      });

      expect(contexts.societies).toHaveLength(1);
      expect(contexts.societies[0]).toEqual({
        id: 'soc-role-1',
        societyId: 'soc-1',
        role: 'SOCIETY_ADMIN',
        societyName: 'Palm Meadows',
      });
    });
  });

  describe('assertPermission', () => {
    const userId = 'user-1';

    const setupUserDbMocks = (options: {
      isSuperadmin?: boolean;
      unitMemberships?: Array<{ unitId: string; societyId: string; role: string }>;
      societyRoles?: Array<{ societyId: string; role: string }>;
    }) => {
      mockDrizzleService.db.select
        // 1. users table select for isSuperadmin
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { isSuperadmin: options.isSuperadmin ?? false },
              ]),
            }),
          }),
        })
        // 2. unitMemberships query
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(options.unitMemberships ?? []),
            }),
          }),
        })
        // 3. societyRoles query
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(options.societyRoles ?? []),
          }),
        });
    };

    it('should allow everything if user is superadmin', async () => {
      setupUserDbMocks({ isSuperadmin: true });

      const allowed = await service.assertPermission(
        userId,
        'any.action',
        ScopeType.GLOBAL,
      );
      expect(allowed).toBe(true);

      const allowedUnit = await service.assertPermission(
        userId,
        'unit.manage',
        ScopeType.UNIT,
        'unit-999',
      );
      expect(allowedUnit).toBe(true);
    });

    it('should grant OWNER approval.decide on their unit and reject for other units', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-1', societyId: 'soc-1', role: 'OWNER' }],
      });

      const allowedSameUnit = await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-1',
      );
      expect(allowedSameUnit).toBe(true);

      const allowedOtherUnit = await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-2',
      );
      expect(allowedOtherUnit).toBe(false);
    });

    it('should allow TENANT to decide approval but not invite member', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-tenant', societyId: 'soc-1', role: 'TENANT' }],
      });

      const canDecide = await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-tenant',
      );
      expect(canDecide).toBe(true);

      const canInvite = await service.assertPermission(
        userId,
        'member.invite',
        ScopeType.UNIT,
        'unit-tenant',
      );
      expect(canInvite).toBe(false);
    });

    it('should allow FAMILY passcode.create but reject staff.assign', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-fam', societyId: 'soc-1', role: 'FAMILY' }],
      });

      const canPasscode = await service.assertPermission(
        userId,
        'passcode.create',
        ScopeType.UNIT,
        'unit-fam',
      );
      expect(canPasscode).toBe(true);

      const canStaff = await service.assertPermission(
        userId,
        'staff.assign',
        ScopeType.UNIT,
        'unit-fam',
      );
      expect(canStaff).toBe(false);
    });

    it('should allow GUARD entry.create on GATE and directory.read on SOCIETY', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD' }],
      });

      // Asserting directly with societyId as target scope
      const canCreateEntry = await service.assertPermission(
        userId,
        'entry.create',
        ScopeType.GATE,
        'soc-1',
      );
      expect(canCreateEntry).toBe(true);

      const canReadDirectory = await service.assertPermission(
        userId,
        'directory.read',
        ScopeType.SOCIETY,
        'soc-1',
      );
      expect(canReadDirectory).toBe(true);

      const canRoster = await service.assertPermission(
        userId,
        'guard.roster',
        ScopeType.SOCIETY,
        'soc-1',
      );
      expect(canRoster).toBe(false);
    });

    it('should allow GUARD on gateId by resolving device society', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD' }],
      });

      // Mock device query returning societyId 'soc-1'
      mockDrizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      const canCreateEntryOnGate = await service.assertPermission(
        userId,
        'entry.create',
        ScopeType.GATE,
        'gate-uuid-123',
      );
      expect(canCreateEntryOnGate).toBe(true);
    });

    it('should allow GUARD_SUPERVISOR guard.roster on SOCIETY', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD_SUPERVISOR' }],
      });

      const canRoster = await service.assertPermission(
        userId,
        'guard.roster',
        ScopeType.SOCIETY,
        'soc-1',
      );
      expect(canRoster).toBe(true);
    });

    it('should allow SOCIETY_ADMIN unit.manage on SOCIETY', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'SOCIETY_ADMIN' }],
      });

      const canManageUnit = await service.assertPermission(
        userId,
        'unit.manage',
        ScopeType.SOCIETY,
        'soc-1',
      );
      expect(canManageUnit).toBe(true);
    });

    it('should use cache on subsequent permission checks without hitting DB again', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-cache', societyId: 'soc-1', role: 'OWNER' }],
      });

      await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-cache',
      );

      const dbCallsAfterFirst = mockDrizzleService.db.select.mock.calls.length;

      // Second check should read from cache
      const secondCheck = await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-cache',
      );
      expect(secondCheck).toBe(true);
      expect(mockDrizzleService.db.select.mock.calls.length).toBe(dbCallsAfterFirst);
    });

    it('should invalidate cache when invalidateUserPermsCache is called', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-inv', societyId: 'soc-1', role: 'OWNER' }],
      });

      await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-inv',
      );

      await service.invalidateUserPermsCache(userId);

      // Setup DB mocks for second load after cache invalidation
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-inv', societyId: 'soc-1', role: 'OWNER' }],
      });

      const resultAfterInvalidation = await service.assertPermission(
        userId,
        'approval.decide',
        ScopeType.UNIT,
        'unit-inv',
      );
      expect(resultAfterInvalidation).toBe(true);
    });
  });
});
