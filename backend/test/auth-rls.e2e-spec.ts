import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ForbiddenException, BadRequestException, ExecutionContext } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordChangeGuard } from '../src/modules/auth/guards/password-change.guard';
import { DrizzleService } from '../src/database/drizzle.service';
import { buildRlsSessionSql } from '../src/database/rls.helper';

describe('Auth, Temp Passwords, Password Change Gate & Tenant RLS E2E Suite', () => {
  let authService: AuthService;
  let guard: PasswordChangeGuard;
  let jwtService: JwtService;

  // In-memory test user database
  const usersDb = [
    {
      id: 'user-uuid-new',
      email: 'newuser@iverto.internal',
      phone: '+91 98765 43210',
      passwordHash: '', // computed in beforeAll
      name: 'New Resident',
      isSuperadmin: false,
      mustChangePassword: true,
      status: 'ACTIVE',
    },
    {
      id: 'user-uuid-active',
      email: 'active@iverto.internal',
      phone: '9998887776',
      passwordHash: '', // computed in beforeAll
      name: 'Active Resident',
      isSuperadmin: false,
      mustChangePassword: false,
      status: 'ACTIVE',
    },
    {
      id: 'user-uuid-suspended',
      email: 'suspended@iverto.internal',
      phone: '1112223334',
      passwordHash: '',
      name: 'Suspended User',
      isSuperadmin: false,
      mustChangePassword: false,
      status: 'SUSPENDED',
    },
  ];

  beforeAll(async () => {
    // Generate temp password hash for +91 98765 43210 -> '919876543210@iverto'
    const tempPass = AuthService.generateTempPassword(usersDb[0].phone);
    usersDb[0].passwordHash = await bcrypt.hash(tempPass, 10);
    usersDb[1].passwordHash = await bcrypt.hash('ActivePass123!', 10);
    usersDb[2].passwordHash = await bcrypt.hash('SuspendedPass123!', 10);
  });

  beforeEach(async () => {
    const mockDrizzle = {
      db: {
        select: () => ({
          from: () => ({
            where: (_cond: any) => ({
              limit: async () => {
                return usersDb;
              },
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => ({
            where: async (_cond: any) => {
              Object.assign(usersDb[0], vals);
              return [usersDb[0]];
            },
          }),
        }),
        // login/changePassword now also issue a refresh token row — not the focus of
        // this suite, so a bare no-op insert is enough to keep them running.
        insert: () => ({
          values: async () => [{ id: 'rt-mock' }],
        }),
      },
      withTenantContext: async (ctx: any, cb: any) => cb(mockDrizzle.db, ctx),
    };

    jwtService = new JwtService({
      secret: 'test-secret-key-12345',
      signOptions: { expiresIn: '15m' },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordChangeGuard,
        {
          provide: DrizzleService,
          useValue: mockDrizzle,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    guard = module.get<PasswordChangeGuard>(PasswordChangeGuard);
  });

  describe('1. Temporary Password Generation & Phone Sanitization', () => {
    it('should generate sanitized <phone>@iverto temporary password format', () => {
      expect(AuthService.generateTempPassword('+91 98765 43210')).toBe('919876543210@iverto');
      expect(AuthService.generateTempPassword('(555) 123-4567')).toBe('5551234567@iverto');
      expect(AuthService.generateTempPassword('9876543210')).toBe('9876543210@iverto');
    });
  });

  describe('2. Login Authentication Flow', () => {
    it('should successfully authenticate user with initial temp password', async () => {
      const tempPass = AuthService.generateTempPassword(usersDb[0].phone);
      const res = await authService.login('newuser@iverto.internal', tempPass);

      expect(res.accessToken).toBeDefined();
      expect(res.user.mustChangePassword).toBe(true);
      expect(res.user.email).toBe('newuser@iverto.internal');
    });

    it('should reject login with incorrect password', async () => {
      await expect(
        authService.login('newuser@iverto.internal', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login for suspended user account', async () => {
      await expect(
        authService.login('suspended@iverto.internal', 'SuspendedPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('3. PasswordChangeGuard Enforcement', () => {
    it('should block access to general protected endpoints when mustChangePassword is true', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-uuid-new', mustChangePassword: true },
            path: '/api/v1/mobile/units/unit-1/pending',
            route: { path: '/api/v1/mobile/units/:unitId/pending' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException);
    });

    it('should allow access to password reset endpoint when mustChangePassword is true', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-uuid-new', mustChangePassword: true },
            path: '/api/v1/auth/change-password',
            route: { path: '/api/v1/auth/change-password' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });

    it('should allow access to protected endpoints when mustChangePassword is false', () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-uuid-active', mustChangePassword: false },
            path: '/api/v1/mobile/units/unit-1/pending',
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(mockExecutionContext)).toBe(true);
    });
  });

  describe('4. Mandatory Password Change & Access Clearance', () => {
    it('should change password, clear mustChangePassword flag, and issue fresh JWT', async () => {
      const newPassword = 'BrandNewSecurePassword123!';
      const result = await authService.changePassword('user-uuid-new', newPassword);

      expect(result.accessToken).toBeDefined();
      expect(result.message).toContain('Password changed successfully');

      // Verify user record was updated
      expect(usersDb[0].mustChangePassword).toBe(false);

      // Verify token decoded claims
      const decoded: any = jwtService.verify(result.accessToken);
      expect(decoded.mustChangePassword).toBe(false);
    });

    it('should reject short passwords less than 8 characters', async () => {
      await expect(
        authService.changePassword('user-uuid-new', 'short'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. Neon PostgreSQL Row-Level Security (RLS) Isolation', () => {
    it('should generate session SQL with society isolation parameters', () => {
      const societyId = 'soc-alpha-1234';
      const userId = 'user-resident-5678';
      const rlsSql = buildRlsSessionSql({ societyId, userId, isSuperadmin: false });

      expect(rlsSql).toBeDefined();
      const rawQuery = JSON.stringify(rlsSql);
      expect(rawQuery).toContain('app.current_society_id');
      expect(rawQuery).toContain('app.current_user_id');
      expect(rawQuery).toContain('app.is_superadmin');
    });

    it('should configure superadmin bypass flag when isSuperadmin is true', () => {
      const rlsSql = buildRlsSessionSql({ isSuperadmin: true });
      const rawQuery = JSON.stringify(rlsSql);
      expect(rawQuery).toContain('app.is_superadmin');
    });
  });
});
