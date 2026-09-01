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
      withSystemContext: jest.fn((cb: any) => cb(mockDrizzleService.db)),
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
          gateId: null,
          societyName: 'Palm Meadows',
        },
      ];

      // Setup Drizzle fluent mock for the three queries: units, society roles, gates
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
        })
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue([]),
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

      // SOCIETY_ADMIN never contributes gate contexts — only GUARD/GUARD_SUPERVISOR do.
      expect(contexts.gates).toEqual([]);
    });

    it('should expand a gate-scoped guard row into one gate context, and a society-wide guard row into every gate the society has', async () => {
      const userId = 'user-456';

      mockDrizzleService.db.select
        // units query — none for this user
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              leftJoin: jest.fn().mockReturnValue({
                leftJoin: jest.fn().mockReturnValue({
                  where: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        })
        // society roles — one gate-scoped GUARD, one society-wide GUARD_SUPERVISOR
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([
                {
                  id: 'role-guard',
                  societyId: 'soc-1',
                  role: 'GUARD',
                  gateId: 'gate-1',
                  societyName: 'Palm Meadows',
                },
                {
                  id: 'role-supervisor',
                  societyId: 'soc-1',
                  role: 'GUARD_SUPERVISOR',
                  gateId: null,
                  societyName: 'Palm Meadows',
                },
              ]),
            }),
          }),
        })
        // gates in the society
        .mockReturnValueOnce({
          from: jest.fn().mockResolvedValue([
            { id: 'gate-1', societyId: 'soc-1', name: 'Main Gate' },
            { id: 'gate-2', societyId: 'soc-1', name: 'Back Gate' },
          ]),
        });

      const contexts = await service.getUserContexts(userId);

      expect(contexts.gates).toHaveLength(3);
      expect(contexts.gates).toContainEqual({
        id: 'role-guard:gate-1',
        gateId: 'gate-1',
        gateName: 'Main Gate',
        societyId: 'soc-1',
        societyName: 'Palm Meadows',
        role: 'GUARD',
      });
      expect(contexts.gates).toContainEqual({
        id: 'role-supervisor:gate-1',
        gateId: 'gate-1',
        gateName: 'Main Gate',
        societyId: 'soc-1',
        societyName: 'Palm Meadows',
        role: 'GUARD_SUPERVISOR',
      });
      expect(contexts.gates).toContainEqual({
        id: 'role-supervisor:gate-2',
        gateId: 'gate-2',
        gateName: 'Back Gate',
        societyId: 'soc-1',
        societyName: 'Palm Meadows',
        role: 'GUARD_SUPERVISOR',
      });
    });
  });

  describe('assertPermission', () => {
    const userId = 'user-1';

    const setupUserDbMocks = (options: {
      isSuperadmin?: boolean;
      unitMemberships?: Array<{ unitId: string; societyId: string; role: string }>;
      societyRoles?: Array<{ societyId: string; role: string; gateId?: string | null }>;
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

    it('should allow GUARD entry.create and directory.read on GATE', async () => {
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
        ScopeType.GATE,
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

    it('should allow a gate-scoped GUARD at their own gate, and reject them at a different gate', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD', gateId: 'gate-1' }],
      });

      mockDrizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ societyId: 'soc-1', gateId: 'gate-1' }]),
          }),
        }),
      });

      const canAtOwnGate = await service.assertPermission(
        userId,
        'entry.create',
        ScopeType.GATE,
        'gate-1',
      );
      expect(canAtOwnGate).toBe(true);
    });

    it('should reject a gate-scoped GUARD at a different gate in the same society', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD', gateId: 'gate-1' }],
      });

      // The device at the targeted gate belongs to the same society, but is a different gate.
      mockDrizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ societyId: 'soc-1', gateId: 'gate-2' }]),
          }),
        }),
      });

      const canAtOtherGate = await service.assertPermission(
        userId,
        'entry.create',
        ScopeType.GATE,
        'gate-2',
      );
      expect(canAtOtherGate).toBe(false);
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

  describe('resolveScopeSocietyId', () => {
    const userId = 'user-1';

    const setupUserDbMocks = (options: {
      isSuperadmin?: boolean;
      unitMemberships?: Array<{ unitId: string; societyId: string; role: string }>;
      societyRoles?: Array<{ societyId: string; role: string; gateId?: string | null }>;
    }) => {
      mockDrizzleService.db.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { isSuperadmin: options.isSuperadmin ?? false },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(options.unitMemberships ?? []),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(options.societyRoles ?? []),
          }),
        });
    };

    it('returns undefined for GLOBAL scope without hitting the DB', async () => {
      const result = await service.resolveScopeSocietyId(userId, ScopeType.GLOBAL, 'anything');
      expect(result).toBeUndefined();
      expect(mockDrizzleService.db.select).not.toHaveBeenCalled();
    });

    it('returns undefined when no targetScopeId is given', async () => {
      const result = await service.resolveScopeSocietyId(userId, ScopeType.SOCIETY, undefined);
      expect(result).toBeUndefined();
      expect(mockDrizzleService.db.select).not.toHaveBeenCalled();
    });

    it('returns the targetScopeId directly for SOCIETY scope', async () => {
      const result = await service.resolveScopeSocietyId(userId, ScopeType.SOCIETY, 'soc-42');
      expect(result).toBe('soc-42');
      expect(mockDrizzleService.db.select).not.toHaveBeenCalled();
    });

    it('resolves the owning society for UNIT scope from cached grants', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-1', societyId: 'soc-1', role: 'OWNER' }],
      });

      const result = await service.resolveScopeSocietyId(userId, ScopeType.UNIT, 'unit-1');
      expect(result).toBe('soc-1');
    });

    it('returns undefined for UNIT scope when the unit is not in the user grants', async () => {
      setupUserDbMocks({
        unitMemberships: [{ unitId: 'unit-1', societyId: 'soc-1', role: 'OWNER' }],
      });

      const result = await service.resolveScopeSocietyId(userId, ScopeType.UNIT, 'unit-not-mine');
      expect(result).toBeUndefined();
    });

    it('resolves GATE scope directly when targetScopeId is already a society grant', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD' }],
      });

      const result = await service.resolveScopeSocietyId(userId, ScopeType.GATE, 'soc-1');
      expect(result).toBe('soc-1');
    });

    it('resolves GATE scope via device lookup when targetScopeId is a raw gate id', async () => {
      setupUserDbMocks({
        societyRoles: [{ societyId: 'soc-1', role: 'GUARD' }],
      });

      mockDrizzleService.db.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ societyId: 'soc-1' }]),
          }),
        }),
      });

      const result = await service.resolveScopeSocietyId(userId, ScopeType.GATE, 'gate-uuid-123');
      expect(result).toBe('soc-1');
    });
  });
});
