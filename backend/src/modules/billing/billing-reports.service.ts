import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { and, count, eq, gte, sql, sum } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { billingCycles, buildings, invoices, payments, societies, units } from '../../database/schema';
import { InvoicesService } from './invoices.service';

export interface LedgerRow {
  unitNumber: string;
  buildingName: string | null;
  periodLabel: string;
  invoiceNumber: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

const LEDGER_COLUMNS: Array<{ key: keyof LedgerRow; label: string }> = [
  { key: 'unitNumber', label: 'Unit' },
  { key: 'buildingName', label: 'Building' },
  { key: 'periodLabel', label: 'Period' },
  { key: 'invoiceNumber', label: 'Invoice #' },
  { key: 'totalAmount', label: 'Total' },
  { key: 'amountPaid', label: 'Paid' },
  { key: 'balance', label: 'Balance' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'status', label: 'Status' },
];

/** "Who's paid, who hasn't, how much, when due" — the report-export requirement. */
@Injectable()
export class BillingReportsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async getLedger(societyId: string, filters: { cycleId?: string } = {}): Promise<LedgerRow[]> {
    const conditions = [eq(invoices.societyId, societyId)];
    if (filters.cycleId) conditions.push(eq(invoices.billingCycleId, filters.cycleId));

    const rows = await this.drizzle.db
      .select({
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
        periodLabel: billingCycles.periodLabel,
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaid,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(units, eq(invoices.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .where(and(...conditions))
      .orderBy(units.unitNumber);

    return rows.map((r) => ({
      ...r,
      totalAmount: Number(r.totalAmount),
      amountPaid: Number(r.amountPaid),
      balance: Number(r.totalAmount) - Number(r.amountPaid),
    }));
  }

  async getDashboardSummary(societyId: string) {
    const [unitsCount] = await this.drizzle.db.select({ count: count() }).from(units).where(eq(units.societyId, societyId));

    const [outstanding] = await this.drizzle.db
      .select({ total: sum(sql`${invoices.totalAmount} - ${invoices.amountPaid}`) })
      .from(invoices)
      .where(and(eq(invoices.societyId, societyId), sql`${invoices.status} in ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')`));

    const [overdueCount] = await this.drizzle.db
      .select({ count: count() })
      .from(invoices)
      .where(and(eq(invoices.societyId, societyId), eq(invoices.status, 'OVERDUE')));

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [collectedThisMonth] = await this.drizzle.db
      .select({ total: sum(payments.amount) })
      .from(payments)
      .where(and(eq(payments.societyId, societyId), eq(payments.status, 'SUCCESS'), gte(payments.paidAt, monthStart)));

    return {
      totalUnits: Number(unitsCount?.count || 0),
      totalOutstanding: Number(outstanding?.total || 0),
      overdueInvoices: Number(overdueCount?.count || 0),
      collectedThisMonth: Number(collectedThisMonth?.total || 0),
    };
  }

  toCsv(rows: LedgerRow[]): string {
    const escape = (value: unknown) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = LEDGER_COLUMNS.map((c) => c.label).join(',');
    const lines = rows.map((row) => LEDGER_COLUMNS.map((c) => escape(row[c.key])).join(','));
    return [header, ...lines].join('\n');
  }

  streamPdf(rows: LedgerRow[], societyName: string, res: Response) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text(`${societyName} — Billing Ledger`, { align: 'left' });
    doc.fontSize(10).fillColor('#555').text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown();

    const colWidths = [70, 90, 55, 90, 60, 60, 60, 70, 70];
    const startX = doc.x;
    let y = doc.y;

    doc.fontSize(9).fillColor('#000');
    LEDGER_COLUMNS.forEach((col, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(col.label, x, y, { width: colWidths[i], continued: false });
    });
    y += 16;
    doc.moveTo(startX, y - 4).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y - 4).stroke();

    for (const row of rows) {
      if (y > 760) {
        doc.addPage();
        y = doc.y;
      }
      LEDGER_COLUMNS.forEach((col, i) => {
        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(String(row[col.key] ?? ''), x, y, { width: colWidths[i] });
      });
      y += 16;
    }

    doc.end();
  }

  async streamInvoiceReceiptPdf(
    societyId: string,
    invoiceId: string,
    outStream: NodeJS.WritableStream,
  ): Promise<void> {
    const invoice = await this.invoicesService.getDetail(societyId, invoiceId);

    const [society] = await this.drizzle.db
      .select({
        name: societies.name,
        address: societies.address,
      })
      .from(societies)
      .where(eq(societies.id, societyId))
      .limit(1);

    const [unitRow] = await this.drizzle.db
      .select({
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
      })
      .from(units)
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .where(eq(units.id, invoice.unitId))
      .limit(1);

    const [cycle] = await this.drizzle.db
      .select({ periodLabel: billingCycles.periodLabel })
      .from(billingCycles)
      .where(eq(billingCycles.id, invoice.billingCycleId))
      .limit(1);

    const doc = new PDFDocument({ margin: 36, size: 'A4' });

    if (outStream && typeof (outStream as any).on === 'function') {
      doc.pipe(outStream);
    }

    const formatCurrency = (amount: number | string) =>
      `₹ ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formatDate = (date: string | Date | null | undefined) => {
      if (!date) return 'N/A';
      const d = typeof date === 'string' ? new Date(date) : date;
      return isNaN(d.getTime()) ? String(date) : d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    // Header
    const societyName = society?.name || 'Apartment Society';
    const societyAddress = society?.address || '';
    const unitDisplay = `${unitRow?.buildingName ? unitRow.buildingName + ' - ' : ''}${unitRow?.unitNumber ?? 'N/A'}`;
    const periodLabel = cycle?.periodLabel ?? 'N/A';

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1A202C').text(societyName, 36, 36);
    if (societyAddress) {
      doc.font('Helvetica').fontSize(9).fillColor('#4A5568').text(societyAddress, 36, doc.y);
    }
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#2B6CB0').text('OFFICIAL MAINTENANCE BILL & PAYMENT RECEIPT');
    doc.font('Helvetica').fontSize(9).fillColor('#718096').text(`Generated Date: ${formatDate(new Date())}`);

    // Separator line
    let curY = doc.y + 8;
    doc.moveTo(36, curY).lineTo(559, curY).strokeColor('#CBD5E0').lineWidth(1).stroke();
    curY += 12;

    // Invoice & Unit Details Block
    const detailsBoxTop = curY;
    const detailsBoxHeight = 65;
    doc.rect(36, detailsBoxTop, 523, detailsBoxHeight).fillAndStroke('#F7FAFC', '#E2E8F0');

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#4A5568');
    doc.text('Invoice Number:', 48, detailsBoxTop + 10);
    doc.font('Helvetica').fillColor('#1A202C').text(invoice.invoiceNumber, 130, detailsBoxTop + 10);

    doc.font('Helvetica-Bold').fillColor('#4A5568').text('Billing Period:', 48, detailsBoxTop + 26);
    doc.font('Helvetica').fillColor('#1A202C').text(periodLabel, 130, detailsBoxTop + 26);

    doc.font('Helvetica-Bold').fillColor('#4A5568').text('Due Date:', 48, detailsBoxTop + 42);
    doc.font('Helvetica').fillColor('#1A202C').text(formatDate(invoice.dueDate), 130, detailsBoxTop + 42);

    doc.font('Helvetica-Bold').fillColor('#4A5568').text('Unit / Flat:', 310, detailsBoxTop + 10);
    doc.font('Helvetica').fillColor('#1A202C').text(unitDisplay, 375, detailsBoxTop + 10);

    doc.font('Helvetica-Bold').fillColor('#4A5568').text('Status:', 310, detailsBoxTop + 26);
    const statusText = (invoice.status || 'PENDING').replace(/_/g, ' ');
    const statusColor =
      invoice.status === 'PAID'
        ? '#276749'
        : invoice.status === 'OVERDUE'
        ? '#9B2C2C'
        : invoice.status === 'PARTIALLY_PAID'
        ? '#C05621'
        : '#4A5568';
    doc.font('Helvetica-Bold').fillColor(statusColor).text(statusText, 375, detailsBoxTop + 26);

    curY = detailsBoxTop + detailsBoxHeight + 16;

    // Itemized Charges Table
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#2D3748').text('Itemized Charges', 36, curY);
    curY += 16;

    // Table Header
    doc.rect(36, curY, 523, 20).fill('#EDF2F7');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#2D3748');
    doc.text('Description', 44, curY + 5, { width: 260 });
    doc.text('Category', 310, curY + 5, { width: 110 });
    doc.text('Amount (₹)', 430, curY + 5, { width: 120, align: 'right' });
    curY += 20;

    // Table Rows
    doc.font('Helvetica').fontSize(9).fillColor('#2D3748');
    const lineItems = (invoice as any).lineItems || [];
    for (const item of lineItems) {
      if (curY > 740) {
        doc.addPage();
        curY = 36;
      }
      doc.text(item.description || 'Maintenance Charge', 44, curY + 5, { width: 260 });
      doc.text(item.category || 'GENERAL', 310, curY + 5, { width: 110 });
      doc.text(formatCurrency(item.amount), 430, curY + 5, { width: 120, align: 'right' });
      curY += 18;
      doc.moveTo(36, curY).lineTo(559, curY).strokeColor('#EDF2F7').lineWidth(0.5).stroke();
    }

    // Total Amount line
    curY += 4;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1A202C');
    doc.text('Total Invoiced Amount:', 250, curY, { width: 170, align: 'right' });
    doc.text(formatCurrency(invoice.totalAmount), 430, curY, { width: 120, align: 'right' });
    curY += 20;

    // Payment History Section (if payments exist)
    const paymentList = (invoice as any).payments || [];
    if (paymentList.length > 0) {
      if (curY > 680) {
        doc.addPage();
        curY = 36;
      }
      curY += 6;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#2D3748').text('Payment History', 36, curY);
      curY += 16;

      doc.rect(36, curY, 523, 20).fill('#EDF2F7');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#2D3748');
      doc.text('Date', 44, curY + 5, { width: 75 });
      doc.text('Method', 122, curY + 5, { width: 68 });
      doc.text('Reference / Txn ID', 194, curY + 5, { width: 115 });
      doc.text('Payer', 312, curY + 5, { width: 125 });
      doc.text('Amount Paid (₹)', 440, curY + 5, { width: 110, align: 'right' });
      curY += 20;

      doc.font('Helvetica').fontSize(8.5).fillColor('#2D3748');
      for (const p of paymentList) {
        if (curY > 740) {
          doc.addPage();
          curY = 36;
        }
        const pDate = p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt);
        const pRef = p.razorpayPaymentId || p.razorpayOrderId || (p.id ? p.id.slice(0, 8) : 'N/A');
        const payerText = p.paidByName ? `${p.paidByName} (${p.paidByRole})` : p.paidByRole || 'Resident';

        doc.text(pDate, 44, curY + 4, { width: 75 });
        doc.text(p.method || 'ONLINE', 122, curY + 4, { width: 68 });
        doc.text(pRef, 194, curY + 4, { width: 115 });
        doc.text(payerText, 312, curY + 4, { width: 125 });
        doc.text(formatCurrency(p.amount), 440, curY + 4, { width: 110, align: 'right' });
        curY += 18;
        doc.moveTo(36, curY).lineTo(559, curY).strokeColor('#EDF2F7').lineWidth(0.5).stroke();
      }
      curY += 10;
    }

    // Financial Summary Box
    if (curY > 680) {
      doc.addPage();
      curY = 36;
    }
    const summaryBoxTop = curY + 4;
    const summaryBoxHeight = 56;
    const summaryBoxWidth = 240;
    const summaryBoxX = 559 - summaryBoxWidth;

    doc.rect(summaryBoxX, summaryBoxTop, summaryBoxWidth, summaryBoxHeight).fillAndStroke('#F7FAFC', '#CBD5E0');
    doc.font('Helvetica').fontSize(9).fillColor('#4A5568');
    doc.text('Total Invoiced:', summaryBoxX + 12, summaryBoxTop + 8);
    doc.font('Helvetica-Bold').fillColor('#1A202C').text(formatCurrency(invoice.totalAmount), summaryBoxX + 110, summaryBoxTop + 8, { width: 118, align: 'right' });

    doc.font('Helvetica').fillColor('#4A5568').text('Total Amount Paid:', summaryBoxX + 12, summaryBoxTop + 23);
    doc.font('Helvetica-Bold').fillColor('#276749').text(formatCurrency(invoice.amountPaid), summaryBoxX + 110, summaryBoxTop + 23, { width: 118, align: 'right' });

    const balance = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid));
    doc.font('Helvetica-Bold').fillColor('#2D3748').text('Outstanding Balance:', summaryBoxX + 12, summaryBoxTop + 38);
    doc.font('Helvetica-Bold').fillColor(balance > 0 ? '#C53030' : '#276749').text(formatCurrency(balance), summaryBoxX + 110, summaryBoxTop + 38, { width: 118, align: 'right' });

    // Footer
    const footerText = 'This is a computer-generated receipt/invoice for society maintenance dues. Generated by Iverto Apartment Management.';
    doc.font('Helvetica').fontSize(8).fillColor('#A0AEC0').text(footerText, 36, 790, { width: 523, align: 'center' });

    return new Promise<void>((resolve, reject) => {
      doc.on('end', () => resolve());
      doc.on('error', (err) => reject(err));
      doc.end();
    });
  }
}
