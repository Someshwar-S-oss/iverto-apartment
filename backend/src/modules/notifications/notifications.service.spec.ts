import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { DrizzleService } from '../../database/drizzle.service';

const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  messaging: jest.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDrizzle: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDrizzle = {
      db: {
        insert: jest.fn(),
        select: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DrizzleService, useValue: mockDrizzle },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDeviceToken', () => {
    it('should upsert device token into database', async () => {
      const mockResult = [
        {
          id: 'token-uuid-1',
          userId: 'user-1',
          fcmToken: 'fcm-token-abc',
          platform: 'android',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const returningMock = jest.fn().mockResolvedValue(mockResult);
      const onConflictDoUpdateMock = jest.fn().mockReturnValue({ returning: returningMock });
      const valuesMock = jest.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
      mockDrizzle.db.insert.mockReturnValue({ values: valuesMock });

      const result = await service.registerDeviceToken('user-1', 'fcm-token-abc', 'android');

      expect(mockDrizzle.db.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          fcmToken: 'fcm-token-abc',
          platform: 'android',
        }),
      );
      expect(result).toEqual(mockResult[0]);
    });
  });

  describe('sendHighPriorityDataMessage', () => {
    it('should return early with 0 counts if token list is empty', async () => {
      const result = await service.sendHighPriorityDataMessage([], { key: 'val' });
      expect(result).toEqual({ successCount: 0, failureCount: 0, responses: [] });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('should send multicast message with high android priority and stringified data', async () => {
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const tokens = ['token-1', 'token-2'];
      const data = { title: 'Visitor Arrived', visitorId: '123' };

      const res = await service.sendHighPriorityDataMessage(tokens, data);

      expect(mockSendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['token-1', 'token-2'],
        data: {
          title: 'Visitor Arrived',
          visitorId: '123',
        },
        android: {
          priority: 'high',
        },
      });
      expect(res.successCount).toBe(2);
    });

    it('should handle sendEachForMulticast exceptions gracefully', async () => {
      mockSendEachForMulticast.mockRejectedValue(new Error('Firebase service unavailable'));

      const result = await service.sendHighPriorityDataMessage(['token-1'], { foo: 'bar' });
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
    });
  });

  describe('sendNotificationToUser', () => {
    it('should insert notification record and dispatch FCM push if user has tokens', async () => {
      const savedNotification = {
        id: 'notif-1',
        userId: 'user-10',
        title: 'New Delivery',
        body: 'Package at gate',
        data: { type: 'DELIVERY', tracking: 'XYZ-999', entryEventId: 'entry-1' },
      };

      const returningMock = jest.fn().mockResolvedValue([savedNotification]);
      const valuesMock = jest.fn().mockReturnValue({ returning: returningMock });
      mockDrizzle.db.insert.mockReturnValue({ values: valuesMock });

      const whereMock = jest.fn().mockResolvedValue([
        { fcmToken: 'fcm-user-10-a' },
        { fcmToken: 'fcm-user-10-b' },
      ]);
      const fromMock = jest.fn().mockReturnValue({ where: whereMock });
      mockDrizzle.db.select.mockReturnValue({ from: fromMock });

      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const res = await service.sendNotificationToUser(
        'user-10',
        'DELIVERY',
        'New Delivery',
        'Package at gate',
        { tracking: 'XYZ-999' },
        'entry-1',
      );

      expect(mockDrizzle.db.insert).toHaveBeenCalled();
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-10',
          title: 'New Delivery',
          body: 'Package at gate',
          data: {
            tracking: 'XYZ-999',
            type: 'DELIVERY',
            entryEventId: 'entry-1',
          },
        }),
      );
      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['fcm-user-10-a', 'fcm-user-10-b'],
          data: expect.objectContaining({
            title: 'New Delivery',
            body: 'Package at gate',
            type: 'DELIVERY',
            tracking: 'XYZ-999',
            entryEventId: 'entry-1',
          }),
          android: {
            priority: 'high',
          },
        }),
      );
      expect(res).toEqual(savedNotification);
    });

    it('should insert notification and not call FCM if user has no tokens registered', async () => {
      const savedNotification = {
        id: 'notif-2',
        userId: 'user-11',
        title: 'Notice',
        body: 'Maintenance scheduled',
        data: { type: 'ANNOUNCEMENT' },
      };

      const returningMock = jest.fn().mockResolvedValue([savedNotification]);
      const valuesMock = jest.fn().mockReturnValue({ returning: returningMock });
      mockDrizzle.db.insert.mockReturnValue({ values: valuesMock });

      const whereMock = jest.fn().mockResolvedValue([]);
      const fromMock = jest.fn().mockReturnValue({ where: whereMock });
      mockDrizzle.db.select.mockReturnValue({ from: fromMock });

      const res = await service.sendNotificationToUser(
        'user-11',
        'ANNOUNCEMENT',
        'Notice',
        'Maintenance scheduled',
      );

      expect(res).toEqual(savedNotification);
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });
  });

  describe('sendNotificationToUnit', () => {
    it('should query active unit members and dispatch notifications to each', async () => {
      const activeMembers = [
        { userId: 'user-unit-1' },
        { userId: 'user-unit-2' },
      ];

      const whereMembersMock = jest.fn().mockResolvedValue(activeMembers);
      const fromMembersMock = jest.fn().mockReturnValue({ where: whereMembersMock });
      mockDrizzle.db.select.mockReturnValueOnce({ from: fromMembersMock });

      // Mock user 1 tokens lookup
      const whereTokensUser1 = jest.fn().mockResolvedValue([{ fcmToken: 'tok-1' }]);
      const fromTokensUser1 = jest.fn().mockReturnValue({ where: whereTokensUser1 });

      // Mock user 2 tokens lookup
      const whereTokensUser2 = jest.fn().mockResolvedValue([{ fcmToken: 'tok-2' }]);
      const fromTokensUser2 = jest.fn().mockReturnValue({ where: whereTokensUser2 });

      mockDrizzle.db.select
        .mockReturnValueOnce({ from: fromTokensUser1 })
        .mockReturnValueOnce({ from: fromTokensUser2 });

      const returningMock1 = jest.fn().mockResolvedValue([{ id: 'n-1', userId: 'user-unit-1' }]);
      const valuesMock1 = jest.fn().mockReturnValue({ returning: returningMock1 });

      const returningMock2 = jest.fn().mockResolvedValue([{ id: 'n-2', userId: 'user-unit-2' }]);
      const valuesMock2 = jest.fn().mockReturnValue({ returning: returningMock2 });

      mockDrizzle.db.insert
        .mockReturnValueOnce({ values: valuesMock1 })
        .mockReturnValueOnce({ values: valuesMock2 });

      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      const res = await service.sendNotificationToUnit(
        'unit-500',
        'VISITOR_REQUEST',
        'Visitor at Gate',
        'John Doe is at the gate',
        { visitorId: 'v-100' },
        'entry-event-1',
      );

      expect(res).toHaveLength(2);
      expect(res[0].id).toBe('n-1');
      expect(res[1].id).toBe('n-2');
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    });
  });
});
