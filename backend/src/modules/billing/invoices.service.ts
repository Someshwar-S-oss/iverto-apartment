import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  adhocCharges,
  billingCycles,
  billingPlans,
  billingSettings,
  buildings,
  invoiceLineItems,
  invoices,
  payments,
  units,
  unitBillingPlans,
} from '../../database/schema';

const toDateString = (d: Date): string => d.toISOString().slice(0, 10);

export interface AdhocChargeRow {
  id: string;
  societyId: string;
  unitId: string;
  title: string;
  amount: number;
  category: 'MAINTENANCE' | 'UTILITY' | 'FINE' | 'AMENITY' | 'OTHER';
  timing: 'IMMEDIATE' | 'START_OF_MONTH';
  dueDateOverride: string | null;
}

/**
 * Owns the one piece of logic the whole feature hinges on: turning a unit's active
 * billing-plan amount plus its pending START_OF_MONTH ad hoc charges into a single
 * itemized invoice per (unit, month), while IMMEDIATE charges get their own standalone
 * invoice the moment they're created. See billing.ts's table comments for the schema this
 * operates on.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Finds this month's OPEN billing cycle for a society, creating it (with defaults from
   * billingSettings, or the hardcoded fallback if the admin never touched settings) if
   * this is the first charge/generation run to need it this month. Idempotent — safe to
   * call from every code path that needs "the current cycle" without any caller having to
   * coordinate who creates it first.
   */
  async getOrCreateCurrentCycle(societyId: string, now: Date = new Date()) {
    const periodLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const [existing] = await this.drizzle.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.societyId, societyId), eq(billingCycles.periodLabel, periodLabel)))
      .limit(1);
    if (existing) return existing;

    const [settings] = await this.drizzle.db
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.societyId, societyId))
      .limit(1);
    const dueDayOfMonth = settings?.dueDayOfMonth ?? 10;

    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const dueDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(dueDayOfMonth, periodEnd.getUTCDate())),
    );

    const [created] = await this.drizzle.db
      .insert(billingCycles)
      .values({
        societyId,
        periodLabel,
        periodStart: toDateString(periodStart),
        periodEnd: toDateString(periodEnd),
        dueDate: toDateString(dueDate),
        status: 'OPEN',
      })
      // Two concurrent callers (e.g. the cron firing right as an admin clicks "Generate
      // Now") racing to create the same society+period row — the unique index on
      // (societyId, periodLabel) makes the loser's insert a no-op instead of a crash.
      .onConflictDoNothing()
      .returning();

    if (created) return created;

    const [row] = await this.drizzle.db
      .select()
      .from(billingCycles)
      .where(and(eq(billingCycles.societyId, societyId), eq(billingCycles.periodLabel, periodLabel)))
      .limit(1);
    return row;
  }

  private async findOrCreateInvoice(
    societyId: string,
    unitId: string,
    billingCycleId: string,
    dueDate: string,
  ) {
    const [existing] = await this.drizzle.db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.unitId, unitId),
          eq(invoices.billingCycleId, billingCycleId),
          eq(invoices.source, 'MONTHLY_COMBINED'),
          // A voided invoice must never be resurrected with new line items — treat it
          // as "not found" so a fresh combined invoice starts in its place instead.
          ne(invoices.status, 'CANCELLED'),
        ),
      )
      .limit(1);
    if (existing) return { invoice: existing, created: false };

    const [cycle] = await this.drizzle.db
      .select({ periodLabel: billingCycles.periodLabel })
      .from(billingCycles)
      .where(eq(billingCycles.id, billingCycleId))
      .limit(1);

    const [{ count: seqCount }] = await this.drizzle.db
      .select({ count: count() })
      .from(invoices)
      .where(eq(invoices.billingCycleId, billingCycleId));

    const invoiceNumber = `INV-${cycle?.periodLabel ?? 'NA'}-${String(Number(seqCount) + 1).padStart(4, '0')}`;

    const [created] = await this.drizzle.db
      .insert(invoices)
      .values({
        societyId,
        unitId,
        billingCycleId,
        source: 'MONTHLY_COMBINED',
        invoiceNumber,
        totalAmount: 0,
        amountPaid: 0,
        status: 'PENDING',
        dueDate,
      })
      .returning();

    return { invoice: created, created: true };
  }

  private async recomputeInvoiceTotal(invoiceId: string) {
    const lineItems = await this.drizzle.db
      .select({ amount: invoiceLineItems.amount })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    const total = lineItems.reduce((sum, li) => sum + Number(li.amount), 0);

    const [invoice] = await this.drizzle.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) return;

    let status = invoice.status;
    if (status !== 'CANCELLED') {
      if (invoice.amountPaid > 0 && invoice.amountPaid >= total) status = 'PAID';
      else if (invoice.amountPaid > 0) status = 'PARTIALLY_PAID';
      else if (status === 'OVERDUE') status = 'OVERDUE';
      else status = 'PENDING';
    }

    await this.drizzle.db.update(invoices).set({ totalAmount: total, status }).where(eq(invoices.id, invoiceId));
  }

  /**
   * The monthly combine job. Pools every unit's active billing-plan amount plus every
   * pending START_OF_MONTH ad hoc charge into one itemized invoice per unit for the
   * current cycle. Safe to run more than once for the same month (admin re-triggering, or
   * the cron and a manual click landing in the same window) — a plan line is only added
   * once per (unit, cycle) and a charge is only ever folded in once (its status flips to
   * INVOICED the moment it's added, so a second pass skips it).
   */
  async generateForSociety(societyId: string, now: Date = new Date()) {
    const cycle = await this.getOrCreateCurrentCycle(societyId, now);
    const touchedInvoiceIds = new Set<string>();
    const newlyCreatedInvoiceIds = new Set<string>();

    const planAssignments = await this.drizzle.db
      .select({
        unitId: unitBillingPlans.unitId,
        billingPlanId: unitBillingPlans.billingPlanId,
        planName: billingPlans.name,
        planAmount: billingPlans.amount,
      })
      .from(unitBillingPlans)
      .innerJoin(billingPlans, eq(unitBillingPlans.billingPlanId, billingPlans.id))
      .innerJoin(units, eq(unitBillingPlans.unitId, units.id))
      .where(and(eq(units.societyId, societyId), eq(billingPlans.isActive, true)));

    for (const assignment of planAssignments) {
      const { invoice, created } = await this.findOrCreateInvoice(societyId, assignment.unitId, cycle.id, cycle.dueDate);
      if (created) newlyCreatedInvoiceIds.add(invoice.id);

      const [existingPlanLine] = await this.drizzle.db
        .select({ id: invoiceLineItems.id })
        .from(invoiceLineItems)
        .where(
          and(
            eq(invoiceLineItems.invoiceId, invoice.id),
            eq(invoiceLineItems.billingPlanId, assignment.billingPlanId),
          ),
        )
        .limit(1);

      if (!existingPlanLine) {
        await this.drizzle.db.insert(invoiceLineItems).values({
          invoiceId: invoice.id,
          description: assignment.planName,
          category: 'MAINTENANCE',
          amount: assignment.planAmount,
          billingPlanId: assignment.billingPlanId,
        });
        touchedInvoiceIds.add(invoice.id);
      }
    }

    const pendingCharges = await this.drizzle.db
      .select()
      .from(adhocCharges)
      .where(
        and(
          eq(adhocCharges.societyId, societyId),
          eq(adhocCharges.timing, 'START_OF_MONTH'),
          eq(adhocCharges.status, 'PENDING_GENERATION'),
        ),
      );

    for (const charge of pendingCharges) {
      const { invoice, created } = await this.findOrCreateInvoice(societyId, charge.unitId, cycle.id, cycle.dueDate);
      if (created) newlyCreatedInvoiceIds.add(invoice.id);

      const [lineItem] = await this.drizzle.db
        .insert(invoiceLineItems)
        .values({
          invoiceId: invoice.id,
          description: charge.title,
          category: charge.category,
          amount: charge.amount,
          adhocChargeId: charge.id,
        })
        .returning();

      await this.drizzle.db
        .update(adhocCharges)
        .set({ status: 'INVOICED', invoiceLineItemId: lineItem.id })
        .where(eq(adhocCharges.id, charge.id));

      touchedInvoiceIds.add(invoice.id);
    }

    for (const invoiceId of touchedInvoiceIds) {
      await this.recomputeInvoiceTotal(invoiceId);
    }

    for (const invoiceId of newlyCreatedInvoiceIds) {
      const [invoice] = await this.drizzle.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (invoice) {
        await this.notifications.sendNotificationToUnit(
          invoice.unitId,
          'BILL_GENERATED',
          'New bill generated',
          `Your bill ${invoice.invoiceNumber} for ${cycle.periodLabel} is ready — ₹${invoice.totalAmount}.`,
          { invoiceId: invoice.id },
        );
      }
    }

    this.logger.log(
      `Generated bills for society ${societyId}, cycle ${cycle.periodLabel}: ${newlyCreatedInvoiceIds.size} new invoices, ${touchedInvoiceIds.size} invoices touched`,
    );

    return {
      cycleId: cycle.id,
      periodLabel: cycle.periodLabel,
      invoicesCreated: newlyCreatedInvoiceIds.size,
      invoicesTouched: touchedInvoiceIds.size,
    };
  }

  /**
   * IMMEDIATE charges skip the monthly pool entirely: this gives the charge its own
   * standalone invoice the instant it's created, so an urgent fine or a same-day tanker
   * bill doesn't wait for the next month's combine run.
   */
  async generateImmediateForCharge(charge: AdhocChargeRow) {
    const cycle = await this.getOrCreateCurrentCycle(charge.societyId);
    const dueDate =
      charge.dueDateOverride ??
      toDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const [invoice] = await this.drizzle.db
      .insert(invoices)
      .values({
        societyId: charge.societyId,
        unitId: charge.unitId,
        billingCycleId: cycle.id,
        source: 'IMMEDIATE',
        invoiceNumber: `INV-${cycle.periodLabel}-IMM-${charge.id.slice(0, 8)}`,
        totalAmount: charge.amount,
        amountPaid: 0,
        status: 'PENDING',
        dueDate,
      })
      .returning();

    const [lineItem] = await this.drizzle.db
      .insert(invoiceLineItems)
      .values({
        invoiceId: invoice.id,
        description: charge.title,
        category: charge.category,
        amount: charge.amount,
        adhocChargeId: charge.id,
      })
      .returning();

    await this.drizzle.db
      .update(adhocCharges)
      .set({ status: 'INVOICED', invoiceLineItemId: lineItem.id })
      .where(eq(adhocCharges.id, charge.id));

    await this.notifications.sendNotificationToUnit(
      charge.unitId,
      'BILL_GENERATED',
      'New bill generated',
      `A new bill ${invoice.invoiceNumber} for "${charge.title}" (₹${charge.amount}) is ready to pay.`,
      { invoiceId: invoice.id },
    );

    return invoice;
  }

  async listForSociety(societyId: string, filters: { unitId?: string; status?: string; cycleId?: string } = {}) {
    const conditions = [eq(invoices.societyId, societyId)];
    if (filters.unitId) conditions.push(eq(invoices.unitId, filters.unitId));
    if (filters.status) conditions.push(eq(invoices.status, filters.status as any));
    if (filters.cycleId) conditions.push(eq(invoices.billingCycleId, filters.cycleId));

    return this.drizzle.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        unitId: invoices.unitId,
        unitNumber: units.unitNumber,
        buildingName: buildings.name,
        billingCycleId: invoices.billingCycleId,
        periodLabel: billingCycles.periodLabel,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaid,
        status: invoices.status,
        dueDate: invoices.dueDate,
        generatedAt: invoices.generatedAt,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .innerJoin(units, eq(invoices.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.generatedAt));
  }

  async listForUnit(societyId: string, unitId: string) {
    return this.listForSociety(societyId, { unitId });
  }

  async getDetail(societyId: string, invoiceId: string) {
    const [invoice] = await this.drizzle.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.societyId, societyId)))
      .limit(1);

    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    const lineItems = await this.drizzle.db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId))
      .orderBy(desc(invoiceLineItems.createdAt));

    const paymentRows = await this.drizzle.db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.createdAt));

    return { ...invoice, lineItems, payments: paymentRows };
  }

  async voidInvoice(societyId: string, invoiceId: string) {
    const [invoice] = await this.drizzle.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.societyId, societyId)))
      .limit(1);

    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cannot void an invoice that has already been paid in full');
    }

    const [updated] = await this.drizzle.db
      .update(invoices)
      .set({ status: 'CANCELLED' })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }

  /**
   * Sends a "due soon" reminder for every unpaid invoice whose due date falls within the
   * owning society's reminderDaysBeforeDue window (default 3 days, from billingSettings —
   * a society that's never touched settings still gets the default via COALESCE rather
   * than being silently skipped). Cron-driven, once daily; not de-duplicated beyond that
   * daily cadence, matching the scheduler's own once-a-day granularity.
   */
  async sendDueSoonReminders(now: Date = new Date()) {
    const todayStr = toDateString(now);

    const dueSoon = await this.drizzle.db
      .select({
        id: invoices.id,
        unitId: invoices.unitId,
        invoiceNumber: invoices.invoiceNumber,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaid,
      })
      .from(invoices)
      .leftJoin(billingSettings, eq(invoices.societyId, billingSettings.societyId))
      .where(
        and(
          inArray(invoices.status, ['PENDING', 'PARTIALLY_PAID']),
          gte(invoices.dueDate, todayStr),
          sql`${invoices.dueDate}::date <= (${todayStr}::date + coalesce(${billingSettings.reminderDaysBeforeDue}, 3) * interval '1 day')`,
        ),
      );

    for (const invoice of dueSoon) {
      const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
      await this.notifications.sendNotificationToUnit(
        invoice.unitId,
        'PAYMENT_DUE',
        'Bill due soon',
        `Invoice ${invoice.invoiceNumber} (₹${outstanding} outstanding) is due on ${invoice.dueDate}.`,
        { invoiceId: invoice.id },
      );
    }

    return dueSoon.length;
  }

  /** Flips PENDING/PARTIALLY_PAID invoices past their due date to OVERDUE. Cron-driven. */
  async markOverdue(now: Date = new Date()) {
    const todayStr = toDateString(now);
    const updated = await this.drizzle.db
      .update(invoices)
      .set({ status: 'OVERDUE' })
      .where(and(inArray(invoices.status, ['PENDING', 'PARTIALLY_PAID']), lt(invoices.dueDate, todayStr)))
      .returning({ id: invoices.id });

    return updated.length;
  }

  /**
   * Applies a successful payment to an invoice: bumps amountPaid, flips status to
   * PAID/PARTIALLY_PAID, and stamps paidAt once fully settled. Shared by the Razorpay
   * confirm path and manual/offline payment recording — see payments.service.ts.
   */
  async applyPayment(invoiceId: string, amount: number) {
    const [invoice] = await this.drizzle.db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    const amountPaid = Number(invoice.amountPaid) + amount;
    const fullyPaid = amountPaid >= Number(invoice.totalAmount);

    const [updated] = await this.drizzle.db
      .update(invoices)
      .set({
        amountPaid,
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        paidAt: fullyPaid ? new Date() : invoice.paidAt,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return updated;
  }
}
