import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { DrizzleService } from '../../database/drizzle.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  const mockDb = {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  };

  const mockDrizzleService = {
    db: mockDb,
  };

  const mockJwtService = {
    sign: jest.fn((payload) => `mock_jwt_token_${payload.sub}`),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  // issueRefreshToken (called by login/changePassword) always does one insert — give it
  // a harmless default so tests that don't care about the refresh token itself don't
  // each need to wire this up individually.
  const mockDefaultInsert = () =>
    mockDb.insert.mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDefaultInsert();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DrizzleService, useValue: mockDrizzleService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('generateTempPassword', () => {
    it('should generate default temporary password format <phone>@iverto (static)', () => {
      const tempPassword = AuthService.generateTempPassword('9876543210');
      expect(tempPassword).toBe('9876543210@iverto');
    });

    it('should sanitize non-digits from phone number', () => {
      const tempPassword = AuthService.generateTempPassword('+91 98765-43210');
      expect(tempPassword).toBe('919876543210@iverto');
    });

    it('should work via instance method', () => {
      const tempPassword = service.generateTempPassword('9988776655');
      expect(tempPassword).toBe('9988776655@iverto');
    });
  });

  describe('login', () => {
    it('should authenticate user successfully and return JWT with mustChangePassword flag', async () => {
      const hashedPassword = await bcrypt.hash('secret123', 10);
      const mockUser = {
        id: 'u-123',
        email: 'user@example.com',
        phone: '9876543210',
        name: 'John Doe',
        passwordHash: hashedPassword,
        isSuperadmin: false,
        mustChangePassword: true,
        status: 'ACTIVE',
      };

      const mockWhere = {
        limit: jest.fn().mockResolvedValue([mockUser]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      const result = await service.login('user@example.com', 'secret123');

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock_jwt_token_u-123');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(result.user.id).toBe('u-123');
      expect(result.user.email).toBe('user@example.com');
      expect(result.user.mustChangePassword).toBe(true);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'u-123',
        email: 'user@example.com',
        isSuperadmin: false,
        mustChangePassword: true,
      });
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      const mockWhere = {
        limit: jest.fn().mockResolvedValue([]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      await expect(service.login('notfound@example.com', 'secret123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);
      const mockUser = {
        id: 'u-123',
        email: 'user@example.com',
        passwordHash: hashedPassword,
        status: 'ACTIVE',
        isSuperadmin: false,
        mustChangePassword: true,
      };

      const mockWhere = {
        limit: jest.fn().mockResolvedValue([mockUser]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      await expect(service.login('user@example.com', 'wrong_password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user is suspended', async () => {
      const hashedPassword = await bcrypt.hash('secret123', 10);
      const mockUser = {
        id: 'u-123',
        email: 'suspended@example.com',
        passwordHash: hashedPassword,
        status: 'SUSPENDED',
        isSuperadmin: false,
        mustChangePassword: false,
      };

      const mockWhere = {
        limit: jest.fn().mockResolvedValue([mockUser]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      await expect(service.login('suspended@example.com', 'secret123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('should reject passwords shorter than 8 characters', async () => {
      await expect(service.changePassword('u-123', 'short')).rejects.toThrow(BadRequestException);
    });

    it('should update password hash, set mustChangePassword to false, and return updated token', async () => {
      const mockSet = {
        where: jest.fn().mockResolvedValue(true),
      };
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue(mockSet),
      });

      const updatedUser = {
        id: 'u-123',
        email: 'user@example.com',
        name: 'John Doe',
        phone: '9876543210',
        isSuperadmin: false,
        mustChangePassword: false,
      };

      const mockWhere = {
        limit: jest.fn().mockResolvedValue([updatedUser]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      const result = await service.changePassword('u-123', 'NewSecurePassword123!');

      expect(result).toBeDefined();
      expect(result.message).toBe('Password changed successfully');
      expect(result.accessToken).toBe('mock_jwt_token_u-123');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user.mustChangePassword).toBe(false);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'u-123',
        email: 'user@example.com',
        isSuperadmin: false,
        mustChangePassword: false,
      });
    });

    it('should throw BadRequestException if user is not found after update', async () => {
      const mockSet = {
        where: jest.fn().mockResolvedValue(true),
      };
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue(mockSet),
      });

      const mockWhere = {
        limit: jest.fn().mockResolvedValue([]),
      };
      const mockFrom = {
        where: jest.fn().mockReturnValue(mockWhere),
      };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue(mockFrom),
      });

      await expect(service.changePassword('u-nonexistent', 'NewSecurePassword123!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshAccessToken', () => {
    const activeUser = {
      id: 'u-123',
      email: 'user@example.com',
      name: 'John Doe',
      phone: '9876543210',
      isSuperadmin: false,
      mustChangePassword: false,
      status: 'ACTIVE',
    };

    const mockSelectRecord = (record: any) => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(record ? [record] : []),
          }),
        }),
      });
    };

    const mockSelectUser = (user: any) => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(user ? [user] : []),
          }),
        }),
      });
    };

    it('should reject an unknown refresh token', async () => {
      mockSelectRecord(undefined);

      await expect(service.refreshAccessToken('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an expired refresh token', async () => {
      mockSelectRecord({
        id: 'rt-1',
        userId: 'u-123',
        revokedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a revoked-but-not-rotated token (e.g. after logout) without mass-revoking', async () => {
      mockSelectRecord({
        id: 'rt-1',
        userId: 'u-123',
        revokedAt: new Date(),
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refreshAccessToken('logged-out-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should treat reuse of an already-rotated token as compromise and revoke every active token for the user', async () => {
      mockSelectRecord({
        id: 'rt-1',
        userId: 'u-123',
        revokedAt: new Date(),
        replacedByTokenId: 'rt-2',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const mockWhere = jest.fn().mockResolvedValue(true);
      mockDb.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: mockWhere }) });

      await expect(service.refreshAccessToken('stolen-and-reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should reject a valid token belonging to a suspended/inactive user', async () => {
      mockSelectRecord({
        id: 'rt-1',
        userId: 'u-123',
        revokedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockSelectUser({ ...activeUser, status: 'SUSPENDED' });

      await expect(service.refreshAccessToken('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate a valid token: issue a new access+refresh token and revoke the old one', async () => {
      mockSelectRecord({
        id: 'rt-1',
        userId: 'u-123',
        revokedAt: null,
        replacedByTokenId: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockSelectUser(activeUser);

      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'rt-2' }]),
        }),
      });

      const mockUpdateWhere = jest.fn().mockResolvedValue(true);
      mockDb.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: mockUpdateWhere }) });

      const result = await service.refreshAccessToken('valid-token');

      expect(result.accessToken).toBe('mock_jwt_token_u-123');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe('valid-token');
      expect(result.user.id).toBe('u-123');
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke the matching, not-yet-revoked token', async () => {
      const mockUpdateWhere = jest.fn().mockResolvedValue(true);
      mockDb.update.mockReturnValue({ set: jest.fn().mockReturnValue({ where: mockUpdateWhere }) });

      await service.revokeRefreshToken('some-token');

      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('createUser', () => {
    it('should create user with temp password and mustChangePassword = true (positional args)', async () => {
      const mockCreated = {
        id: 'u-new-1',
        email: 'newuser@example.com',
        phone: '9876543210',
        name: 'New User',
        isSuperadmin: false,
        mustChangePassword: true,
        status: 'ACTIVE',
      };

      const mockValues = {
        returning: jest.fn().mockResolvedValue([mockCreated]),
      };
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(mockValues),
      });

      const res = await service.createUser('newuser@example.com', '9876543210', 'New User', false);

      expect(res).toBeDefined();
      expect(res.id).toBe('u-new-1');
      expect(res.tempPassword).toBe('9876543210@iverto');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create user with temp password and object input', async () => {
      const mockCreated = {
        id: 'u-new-2',
        email: 'admin@example.com',
        phone: '9123456780',
        name: 'Admin User',
        isSuperadmin: true,
        mustChangePassword: true,
        status: 'ACTIVE',
      };

      const mockValues = {
        returning: jest.fn().mockResolvedValue([mockCreated]),
      };
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(mockValues),
      });

      const res = await service.createUser({
        email: 'admin@example.com',
        phone: '9123456780',
        name: 'Admin User',
        isSuperadmin: true,
      });

      expect(res).toBeDefined();
      expect(res.id).toBe('u-new-2');
      expect(res.tempPassword).toBe('9123456780@iverto');
    });

    it('should support using custom transaction tx', async () => {
      const mockTx = {
        insert: jest.fn(),
      };
      const mockCreated = {
        id: 'u-new-tx',
        email: 'txuser@example.com',
        phone: '9811122233',
        name: 'Tx User',
        isSuperadmin: false,
        mustChangePassword: true,
        status: 'ACTIVE',
      };
      const mockValues = {
        returning: jest.fn().mockResolvedValue([mockCreated]),
      };
      mockTx.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(mockValues),
      });

      const res = await service.createUser(
        { email: 'txuser@example.com', phone: '9811122233', name: 'Tx User' },
        mockTx,
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('u-new-tx');
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});
