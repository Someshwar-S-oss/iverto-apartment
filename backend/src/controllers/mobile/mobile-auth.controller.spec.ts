import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MobileAuthController } from './mobile-auth.controller';
import { RbacService } from '../../modules/rbac/rbac.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

describe('MobileAuthController', () => {
  let controller: MobileAuthController;
  let mockRbacService: any;
  let mockNotificationsService: any;

  beforeEach(async () => {
    mockRbacService = {
      getUserContexts: jest.fn(),
    };

    mockNotificationsService = {
      registerDeviceToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileAuthController],
      providers: [
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<MobileAuthController>(MobileAuthController);
  });

  describe('getMyContexts', () => {
    it('should return user active memberships and roles', async () => {
      const mockContexts = {
        units: [
          {
            id: 'mem-1',
            unitId: 'u-1',
            role: 'OWNER',
            isPrimary: true,
            societyId: 'soc-1',
          },
        ],
        societies: [],
      };

      mockRbacService.getUserContexts.mockResolvedValueOnce(mockContexts);

      const result = await controller.getMyContexts('user-1');
      expect(result).toEqual(mockContexts);
      expect(mockRbacService.getUserContexts).toHaveBeenCalledWith('user-1');
    });
  });

  describe('registerDeviceToken', () => {
    it('should throw BadRequestException if token or platform missing', async () => {
      await expect(
        controller.registerDeviceToken('user-1', {
          fcmToken: '',
          platform: 'android',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should register FCM device token for push notifications', async () => {
      const mockToken = {
        id: 'tok-1',
        userId: 'user-1',
        fcmToken: 'fcm-token-123',
        platform: 'android',
      };

      mockNotificationsService.registerDeviceToken.mockResolvedValueOnce(mockToken);

      const result = await controller.registerDeviceToken('user-1', {
        fcmToken: 'fcm-token-123',
        platform: 'android',
      });

      expect(result).toEqual(mockToken);
      expect(mockNotificationsService.registerDeviceToken).toHaveBeenCalledWith(
        'user-1',
        'fcm-token-123',
        'android',
      );
    });
  });
});
