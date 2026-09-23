import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { and, count, eq, gte, sql, sum } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { billingCycles, buildings, invoices, payments, units } from '../../database/schema';

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
  constructor(private readonly drizzle: DrizzleService) {}

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
}
