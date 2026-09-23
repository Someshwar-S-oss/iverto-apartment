import { Test, TestingModule } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { DrizzleService } from '../../database/drizzle.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let mockDb: any;
  let mockNotifications: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockNotifications = {
      sendNotificationToUnit: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('applyPayment', () => {
    it('flips a fully-paid invoice to PAID and stamps paidAt', async () => {
      const invoice = { id: 'inv-1', totalAmount: 1000, amountPaid: 0, status: 'PENDING', paidAt: null };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([invoice]) }) }),
      });

      let capturedSet: any;
      mockDb.update.mockReturnValue({
        set: jest.fn((payload) => {
          capturedSet = payload;
          return { where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...invoice, ...payload }]) }) };
        }),
      });

      const result = await service.applyPayment('inv-1', 1000);

      expect(capturedSet.status).toBe('PAID');
      expect(capturedSet.amountPaid).toBe(1000);
      expect(capturedSet.paidAt).toBeInstanceOf(Date);
      expect(result.status).toBe('PAID');
    });

    it('flips a partially-paid invoice to PARTIALLY_PAID and leaves paidAt unset', async () => {
      const invoice = { id: 'inv-2', totalAmount: 1000, amountPaid: 0, status: 'PENDING', paidAt: null };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([invoice]) }) }),
      });

      let capturedSet: any;
      mockDb.update.mockReturnValue({
        set: jest.fn((payload) => {
          capturedSet = payload;
          return { where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...invoice, ...payload }]) }) };
        }),
      });

      await service.applyPayment('inv-2', 400);

      expect(capturedSet.status).toBe('PARTIALLY_PAID');
      expect(capturedSet.amountPaid).toBe(400);
      expect(capturedSet.paidAt).toBeNull();
    });

    it('accumulates amountPaid across two partial payments until fully settled', async () => {
      const invoice = { id: 'inv-3', totalAmount: 1000, amountPaid: 400, status: 'PARTIALLY_PAID', paidAt: null };
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([invoice]) }) }),
      });

      let capturedSet: any;
      mockDb.update.mockReturnValue({
        set: jest.fn((payload) => {
          capturedSet = payload;
          return { where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ ...invoice, ...payload }]) }) };
        }),
      });

      await service.applyPayment('inv-3', 600);

      expect(capturedSet.amountPaid).toBe(1000);
      expect(capturedSet.status).toBe('PAID');
    });

    it('throws NotFoundException for an unknown invoice', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }) }),
      });

      await expect(service.applyPayment('missing', 100)).rejects.toThrow('missing');
    });
  });

  describe('markOverdue', () => {
    it('flips PENDING/PARTIALLY_PAID invoices past their due date and returns the count', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) }),
        }),
      });

      const count = await service.markOverdue(new Date('2026-09-15'));
      expect(count).toBe(2);
    });

    it('returns 0 when nothing is overdue', async () => {
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) }),
      });

      expect(await service.markOverdue(new Date('2026-09-15'))).toBe(0);
    });
  });
});
