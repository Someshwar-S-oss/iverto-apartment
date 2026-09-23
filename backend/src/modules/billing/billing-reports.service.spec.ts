import { Test, TestingModule } from '@nestjs/testing';
import { PassThrough } from 'stream';
import { BillingReportsService } from './billing-reports.service';
import { DrizzleService } from '../../database/drizzle.service';
import { InvoicesService } from './invoices.service';

describe('BillingReportsService', () => {
  let service: BillingReportsService;
  let mockDb: any;
  let mockInvoicesService: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
    };

    mockInvoicesService = {
      getDetail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingReportsService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: InvoicesService,
          useValue: mockInvoicesService,
        },
      ],
    }).compile();

    service = module.get<BillingReportsService>(BillingReportsService);
  });

  describe('streamInvoiceReceiptPdf', () => {
    it('should generate and stream a receipt PDF with line items and payment history', async () => {
      const mockInvoice = {
        id: 'inv-100',
        societyId: 'soc-1',
        unitId: 'unit-1',
        billingCycleId: 'cycle-1',
        invoiceNumber: 'INV-2026-09-0001',
        totalAmount: 3500,
        amountPaid: 3500,
        status: 'PAID',
        dueDate: '2026-09-15',
        lineItems: [
          { description: 'Monthly Maintenance', category: 'MAINTENANCE', amount: 3000 },
          { description: 'Sinking Fund', category: 'SINKING_FUND', amount: 500 },
        ],
        payments: [
          {
            id: 'pay-1',
            amount: 3500,
            method: 'RAZORPAY',
            status: 'SUCCESS',
            razorpayPaymentId: 'pay_xyz789',
            paidByName: 'John Doe',
            paidByRole: 'OWNER',
            paidAt: new Date('2026-09-10T10:00:00Z'),
            createdAt: new Date('2026-09-10T10:00:00Z'),
          },
        ],
      };

      mockInvoicesService.getDetail.mockResolvedValueOnce(mockInvoice);

      // Society query
      const selectSocietyChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              { name: 'Palm Grove Apartments', address: '123 Palm Ave, Bangalore' },
            ]),
          }),
        }),
      };

      // Unit/building query
      const selectUnitChain = {
        from: jest.fn().mockReturnValue({
          leftJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { unitNumber: 'A-402', buildingName: 'Tower A' },
              ]),
            }),
          }),
        }),
      };

      // Cycle query
      const selectCycleChain = {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              { periodLabel: '2026-09' },
            ]),
          }),
        }),
      };

      mockDb.select
        .mockReturnValueOnce(selectSocietyChain)
        .mockReturnValueOnce(selectUnitChain)
        .mockReturnValueOnce(selectCycleChain);

      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];
      passThrough.on('data', (chunk) => chunks.push(chunk));

      await service.streamInvoiceReceiptPdf('soc-1', 'inv-100', passThrough);

      const pdfBuffer = Buffer.concat(chunks);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      // Valid PDF files start with '%PDF-'
      expect(pdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');
    });

    it('should generate and stream a receipt PDF with partial payment and overdue status', async () => {
      const mockInvoice = {
        id: 'inv-200',
        societyId: 'soc-1',
        unitId: 'unit-2',
        billingCycleId: 'cycle-1',
        invoiceNumber: 'INV-2026-09-0002',
        totalAmount: 5000,
        amountPaid: 2000,
        status: 'OVERDUE',
        dueDate: '2026-09-05',
        lineItems: [
          { description: 'Maintenance Charge', category: 'GENERAL', amount: 5000 },
        ],
        payments: [
          {
            id: 'pay-2',
            amount: 2000,
            method: 'MANUAL',
            status: 'SUCCESS',
            paidByName: 'Society Admin',
            paidByRole: 'SOCIETY_ADMIN',
            paidAt: null,
            createdAt: new Date('2026-09-06T12:00:00Z'),
          },
        ],
      };

      mockInvoicesService.getDetail.mockResolvedValueOnce(mockInvoice);

      mockDb.select
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ name: 'Palm Grove', address: null }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            leftJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([{ unitNumber: 'B-101', buildingName: null }]),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ periodLabel: '2026-09' }]),
            }),
          }),
        });

      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];
      passThrough.on('data', (chunk) => chunks.push(chunk));

      await service.streamInvoiceReceiptPdf('soc-1', 'inv-200', passThrough);

      const pdfBuffer = Buffer.concat(chunks);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      expect(pdfBuffer.toString('utf-8', 0, 5)).toBe('%PDF-');
    });
  });
});
