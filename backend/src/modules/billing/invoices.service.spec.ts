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

  describe('getDetail', () => {
    const mockInvoice = {
      id: 'inv-1',
      societyId: 'soc-1',
      unitId: 'unit-1',
      totalAmount: 1500,
      amountPaid: 1500,
      status: 'PAID',
    };
    const mockLineItems = [
      { id: 'li-1', invoiceId: 'inv-1', amount: 1500, description: 'Maintenance charge' },
    ];

    function createQueryChain(result: any) {
      const chain: any = {
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(result),
      };
      chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
      return chain;
    }

    it('enriches payment with payer identity and unit role for online payment', async () => {
      const paymentRow = {
        id: 'pay-1',
        societyId: 'soc-1',
        invoiceId: 'inv-1',
        unitId: 'unit-1',
        amount: 1500,
        method: 'RAZORPAY',
        status: 'SUCCESS',
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig_1',
        rawResponse: {},
        paidByUserId: 'user-1',
        paidAt: new Date(),
        createdAt: new Date(),
        userName: 'Alice Smith',
        userEmail: 'alice@example.com',
        membershipRole: 'TENANT',
      };

      mockDb.select
        .mockReturnValueOnce(createQueryChain([mockInvoice]))
        .mockReturnValueOnce(createQueryChain(mockLineItems))
        .mockReturnValueOnce(createQueryChain([paymentRow]));

      const result = await service.getDetail('soc-1', 'inv-1');

      expect(result.id).toBe('inv-1');
      expect(result.lineItems).toEqual(mockLineItems);
      expect(result.payments).toHaveLength(1);

      const p = result.payments[0];
      expect(p.paidByName).toBe('Alice Smith');
      expect(p.paidByEmail).toBe('alice@example.com');
      expect(p.paidByRole).toBe('TENANT');
      expect(p.note).toBeNull();
      expect(p.amount).toBe(1500);
      expect(p.method).toBe('RAZORPAY');
    });

    it('enriches manual payment falling back to Society Admin and uses rawResponse payerRole and note', async () => {
      const paymentRow = {
        id: 'pay-2',
        societyId: 'soc-1',
        invoiceId: 'inv-1',
        unitId: 'unit-1',
        amount: 1500,
        method: 'MANUAL',
        status: 'SUCCESS',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
        rawResponse: { note: 'Cash collected by security', payerRole: 'OWNER', recordedByAdmin: 'admin-1' },
        paidByUserId: 'admin-1',
        paidAt: new Date(),
        createdAt: new Date(),
        userName: null,
        userEmail: null,
        membershipRole: null,
      };

      mockDb.select
        .mockReturnValueOnce(createQueryChain([mockInvoice]))
        .mockReturnValueOnce(createQueryChain(mockLineItems))
        .mockReturnValueOnce(createQueryChain([paymentRow]));

      const result = await service.getDetail('soc-1', 'inv-1');

      const p = result.payments[0];
      expect(p.paidByName).toBe('Society Admin');
      expect(p.paidByEmail).toBeNull();
      expect(p.paidByRole).toBe('OWNER');
      expect(p.note).toBe('Cash collected by security');
    });

    it('falls back to SOCIETY_ADMIN when manual/offline payment has no membership or rawResponse payerRole', async () => {
      const paymentRow = {
        id: 'pay-3',
        societyId: 'soc-1',
        invoiceId: 'inv-1',
        unitId: 'unit-1',
        amount: 1500,
        method: 'OFFLINE',
        status: 'SUCCESS',
        razorpayOrderId: null,
        razorpayPaymentId: null,
        razorpaySignature: null,
        rawResponse: null,
        paidByUserId: 'admin-1',
        paidAt: new Date(),
        createdAt: new Date(),
        userName: null,
        userEmail: null,
        membershipRole: null,
      };

      mockDb.select
        .mockReturnValueOnce(createQueryChain([mockInvoice]))
        .mockReturnValueOnce(createQueryChain(mockLineItems))
        .mockReturnValueOnce(createQueryChain([paymentRow]));

      const result = await service.getDetail('soc-1', 'inv-1');

      const p = result.payments[0];
      expect(p.paidByName).toBe('Society Admin');
      expect(p.paidByRole).toBe('SOCIETY_ADMIN');
      expect(p.note).toBeNull();
    });

    it('falls back to UNKNOWN when online payment has no membership role', async () => {
      const paymentRow = {
        id: 'pay-4',
        societyId: 'soc-1',
        invoiceId: 'inv-1',
        unitId: 'unit-1',
        amount: 1500,
        method: 'RAZORPAY',
        status: 'SUCCESS',
        razorpayOrderId: 'order_4',
        razorpayPaymentId: 'pay_4',
        razorpaySignature: 'sig_4',
        rawResponse: {},
        paidByUserId: 'external-user',
        paidAt: new Date(),
        createdAt: new Date(),
        userName: 'External User',
        userEmail: 'external@example.com',
        membershipRole: null,
      };

      mockDb.select
        .mockReturnValueOnce(createQueryChain([mockInvoice]))
        .mockReturnValueOnce(createQueryChain(mockLineItems))
        .mockReturnValueOnce(createQueryChain([paymentRow]));

      const result = await service.getDetail('soc-1', 'inv-1');

      const p = result.payments[0];
      expect(p.paidByName).toBe('External User');
      expect(p.paidByRole).toBe('UNKNOWN');
      expect(p.note).toBeNull();
    });
  });
});

