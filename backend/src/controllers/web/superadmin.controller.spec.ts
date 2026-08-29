import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperadminController } from './superadmin.controller';
import { DrizzleService } from '../../database/drizzle.service';
import { AuthService } from '../../modules/auth/auth.service';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';

describe('SuperadminController', () => {
  let controller: SuperadminController;
  let mockDb: any;
  let mockAuthService: any;

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperadminController],
      providers: [
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(RbacScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SuperadminController>(SuperadminController);
  });

  describe('createSociety', () => {
    it('should throw BadRequestException if required fields are missing', async () => {
      await expect(
        controller.createSociety({
          name: '',
          adminEmail: 'admin@example.com',
          adminPhone: '9876543210',
          adminName: 'Admin',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create society, admin user with temp password, and assign SOCIETY_ADMIN role', async () => {
      const mockSociety = {
        id: 'soc-1',
        name: 'Palm Meadows',
        timezone: 'Asia/Kolkata',
        address: 'Whitefield',
        status: 'ACTIVE',
      };

      const mockAdminUser = {
        id: 'user-1',
        email: 'admin@palm.com',
        phone: '9876543210',
        name: 'Society Admin',
      };

      // 1. Insert society returning mockSociety
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockSociety]),
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

      // 3. Insert new admin user
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockAdminUser]),
        }),
      });

      // 4. Insert society role
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockResolvedValueOnce([{ id: 'role-1' }]),
      });

      const result = await controller.createSociety({
        name: 'Palm Meadows',
        timezone: 'Asia/Kolkata',
        address: 'Whitefield',
        adminName: 'Society Admin',
        adminEmail: 'admin@palm.com',
        adminPhone: '9876543210',
      });

      expect(result.society).toEqual(mockSociety);
      expect(result.adminUser.email).toBe('admin@palm.com');
      expect(result.adminUser.tempPassword).toBe('9876543210@iverto');
    });
  });

  describe('listSocieties', () => {
    it('should return all societies', async () => {
      const mockList = [{ id: 'soc-1', name: 'Palm Meadows' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockList),
      });

      const result = await controller.listSocieties();
      expect(result).toEqual(mockList);
    });
  });

  describe('updateSocietyStatus', () => {
    it('should throw BadRequestException for invalid status', async () => {
      await expect(
        controller.updateSocietyStatus('soc-1', { status: 'INVALID' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update society status and return updated record', async () => {
      const mockUpdated = { id: 'soc-1', status: 'SUSPENDED' };
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([mockUpdated]),
          }),
        }),
      });

      const result = await controller.updateSocietyStatus('soc-1', { status: 'SUSPENDED' });
      expect(result).toEqual(mockUpdated);
    });

    it('should throw NotFoundException if society is not found', async () => {
      mockDb.update.mockReturnValueOnce({
        set: jest.fn().mockReturnValueOnce({
          where: jest.fn().mockReturnValueOnce({
            returning: jest.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      await expect(
        controller.updateSocietyStatus('soc-99', { status: 'ACTIVE' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('provisionDevice', () => {
    it('should throw BadRequestException if required fields missing', async () => {
      await expect(
        controller.provisionDevice({
          societyId: '',
          serialNo: '',
          vendor: 'M50',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should provision a new device', async () => {
      const mockDevice = {
        id: 'dev-1',
        societyId: 'soc-1',
        vendor: 'M50',
        serialNo: 'DJ20250307014',
        status: 'OFFLINE',
      };

      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnValueOnce({
          returning: jest.fn().mockResolvedValueOnce([mockDevice]),
        }),
      });

      const result = await controller.provisionDevice({
        societyId: 'soc-1',
        vendor: 'M50',
        serialNo: 'DJ20250307014',
      });

      expect(result).toEqual(mockDevice);
    });
  });

  describe('listDevices', () => {
    it('should return list of devices', async () => {
      const mockDevices = [{ id: 'dev-1', serialNo: 'DJ20250307014' }];
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce(mockDevices),
      });

      const result = await controller.listDevices();
      expect(result).toEqual(mockDevices);
    });
  });

  describe('getAnalytics', () => {
    it('should return platform analytics aggregated counts', async () => {
      // 4 count queries for societies, devices, users, entryEvents
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce([{ count: '10' }]),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce([{ count: '25' }]),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce([{ count: '150' }]),
      });
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockResolvedValueOnce([{ count: '1200' }]),
      });

      const result = await controller.getAnalytics();
      expect(result).toEqual({
        totalSocieties: 10,
        totalDevices: 25,
        totalUsers: 150,
        totalEntryEvents: 1200,
      });
    });
  });
});
