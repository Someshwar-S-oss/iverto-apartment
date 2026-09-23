import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MobileBillingController } from './mobile-billing.controller';
import { DrizzleService } from '../../database/drizzle.service';
import { InvoicesService } from '../../modules/billing/invoices.service';
import { PaymentsService } from '../../modules/billing/payments.service';
import { BillingReportsService } from '../../modules/billing/billing-reports.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

describe('MobileBillingController', () => {
  let controller: MobileBillingController;
  let mockDb: any;
  let mockInvoicesService: any;
  let mockPaymentsService: any;
  let mockBillingReportsService: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ societyId: 'soc-123' }]),
          }),
        }),
      }),
    };

    mockInvoicesService = {
      listForUnit: jest.fn(),
      getDetail: jest.fn(),
    };

    mockPaymentsService = {
      createOrder: jest.fn(),
      confirmPayment: jest.fn(),
    };

    mockBillingReportsService = {
      streamInvoiceReceiptPdf: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileBillingController],
      providers: [
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: InvoicesService,
          useValue: mockInvoicesService,
        },
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: BillingReportsService,
          useValue: mockBillingReportsService,
        },
        IdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PasswordChangeGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RbacScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MobileBillingController>(MobileBillingController);
  });

  describe('getInvoiceReceipt', () => {
    it('should set PDF headers and stream receipt when invoice belongs to the unit', async () => {
      const mockInvoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-09-0001',
        unitId: 'unit-123',
        totalAmount: 1500,
        amountPaid: 1500,
        status: 'PAID',
      };

      mockInvoicesService.getDetail.mockResolvedValueOnce(mockInvoice);

      const mockRes: any = {
        setHeader: jest.fn(),
      };

      await (controller as any).getInvoiceReceipt('unit-123', 'inv-1', mockRes);

      expect(mockInvoicesService.getDetail).toHaveBeenCalledWith('soc-123', 'inv-1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'inline; filename="receipt-INV-2026-09-0001.pdf"',
      );
      expect(mockBillingReportsService.streamInvoiceReceiptPdf).toHaveBeenCalledWith(
        'soc-123',
        'inv-1',
        mockRes,
      );
    });

    it('should throw NotFoundException when invoice does not belong to the requested unit', async () => {
      const mockInvoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-09-0001',
        unitId: 'unit-other',
        totalAmount: 1500,
      };

      mockInvoicesService.getDetail.mockResolvedValueOnce(mockInvoice);

      const mockRes: any = {
        setHeader: jest.fn(),
      };

      await expect(
        (controller as any).getInvoiceReceipt('unit-123', 'inv-1', mockRes),
      ).rejects.toThrow(NotFoundException);

      expect(mockBillingReportsService.streamInvoiceReceiptPdf).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when unit is not found', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const mockRes: any = {
        setHeader: jest.fn(),
      };

      await expect(
        (controller as any).getInvoiceReceipt('unit-missing', 'inv-1', mockRes),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMyInvoices', () => {
    it('should return list of invoices for the unit', async () => {
      const invoices = [{ id: 'inv-1' }];
      mockInvoicesService.listForUnit.mockResolvedValueOnce(invoices);

      const result = await controller.listMyInvoices('unit-123');
      expect(result).toBe(invoices);
      expect(mockInvoicesService.listForUnit).toHaveBeenCalledWith('soc-123', 'unit-123');
    });
  });

  describe('getInvoice', () => {
    it('should return invoice when belonging to the unit', async () => {
      const invoice = { id: 'inv-1', unitId: 'unit-123' };
      mockInvoicesService.getDetail.mockResolvedValueOnce(invoice);

      const result = await controller.getInvoice('unit-123', 'inv-1');
      expect(result).toBe(invoice);
    });

    it('should throw NotFoundException when invoice belongs to another unit', async () => {
      const invoice = { id: 'inv-1', unitId: 'unit-other' };
      mockInvoicesService.getDetail.mockResolvedValueOnce(invoice);

      await expect(controller.getInvoice('unit-123', 'inv-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
