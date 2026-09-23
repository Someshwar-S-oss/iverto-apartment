import {
  pgTable,
  pgPolicy,
  uuid,
  varchar,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { societies, units } from './societies';
import { users } from './users';
import {
  chargeCategoryEnum,
  chargeTimingEnum,
  adhocChargeStatusEnum,
  billingCycleStatusEnum,
  invoiceStatusEnum,
  invoiceSourceEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from './enums';
import { superadminOrOwnSociety, superadminOrParentRowVisible } from './rls-policies';

// Per-society tunables for due-date/reminder logic, so InvoicesService/BillingSchedulerService
// don't hardcode "the 10th" for every society. One row per society, created lazily with
// defaults the first time an admin touches billing settings (see billing-plans.service.ts).
export const billingSettings = pgTable(
  'billing_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id')
      .references(() => societies.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    dueDayOfMonth: integer('due_day_of_month').default(10).notNull(),
    reminderDaysBeforeDue: integer('reminder_days_before_due').default(3).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_billing_settings', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// A "slab" — a recurring monthly amount a group of units gets billed. Units are grouped
// into a slab via unitBillingPlans below, not a column here, so admin can create the slab
// once ("2BHK Standard – ₹2500") and assign/reassign whichever units to it in bulk.
export const billingPlans = pgTable(
  'billing_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    // doublePrecision (not numeric) so every service deals in plain JS numbers, not
    // numeric-as-string arithmetic — this drizzle-orm version's numeric() has no 'mode'
    // option to opt into number mode. Fine at INR-with-cents scale; not appropriate if
    // this schema were ever handling currencies needing exact decimal accounting.
    amount: doublePrecision('amount').notNull(),
    description: varchar('description', { length: 512 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_billing_plans', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// Which slab a unit is currently on. unitId is unique — one active slab per unit;
// reassigning a unit to a different slab just updates this row rather than versioning it.
export const unitBillingPlans = pgTable(
  'unit_billing_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull().unique(),
    billingPlanId: uuid('billing_plan_id').references(() => billingPlans.id, { onDelete: 'cascade' }).notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_unit_billing_plans', {
      for: 'all',
      using: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
      withCheck: superadminOrParentRowVisible(table.unitId, sql`select id from ${units}`),
    }),
  ],
).enableRLS();

// Admin-managed catalog of reusable charge templates (e.g. "Water Tanker – ₹500", "Late
// Fine – ₹200") so ad hoc charges don't need retyping a title/amount every time. Purely a
// convenience lookup — adhocCharges below snapshots its own title/amount/category at
// creation time rather than referencing this live, so editing/deleting a charge type never
// changes charges already raised against it.
export const chargeTypes = pgTable(
  'charge_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    category: chargeCategoryEnum('category').default('OTHER').notNull(),
    defaultAmount: doublePrecision('default_amount'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_charge_types', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// The individual/extra-charge/fine primitive — one row per unit (a "bill this to 5 units"
// admin action inserts 5 rows sharing a batchId, purely for the admin UI to show them as one
// action afterwards; there is no shared parent row). `timing` decides whether
// InvoicesService bills it standalone right away (IMMEDIATE) or pools it into next month's
// combined invoice (START_OF_MONTH) — see invoices.service.ts.
export const adhocCharges = pgTable(
  'adhoc_charges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    chargeTypeId: uuid('charge_type_id').references(() => chargeTypes.id, { onDelete: 'set null' }),
    batchId: uuid('batch_id').defaultRandom().notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    amount: doublePrecision('amount').notNull(),
    category: chargeCategoryEnum('category').default('OTHER').notNull(),
    timing: chargeTimingEnum('timing').default('START_OF_MONTH').notNull(),
    // Only meaningful for an IMMEDIATE charge's own standalone invoice; START_OF_MONTH
    // charges always take the owning billingCycle's dueDate once folded into a combined
    // invoice, so this stays null for them.
    dueDateOverride: date('due_date_override'),
    status: adhocChargeStatusEnum('status').default('PENDING_GENERATION').notNull(),
    invoiceLineItemId: uuid('invoice_line_item_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_adhoc_charges', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// One row per society per calendar month ("2026-09"), created on demand by the monthly
// generation job (or the admin's manual "Generate Now") — the container every combined
// invoice for that month belongs to, and the unit of "who's paid this month" reporting.
export const billingCycles = pgTable(
  'billing_cycles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    periodLabel: varchar('period_label', { length: 16 }).notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    dueDate: date('due_date').notNull(),
    status: billingCycleStatusEnum('status').default('OPEN').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('billing_cycles_society_period_idx').on(table.societyId, table.periodLabel),
    pgPolicy('tenant_isolation_billing_cycles', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// The payable bill. A combined start-of-month bill and a standalone immediate bill are the
// same row shape — the only difference is how many invoiceLineItems point at it. No
// payment-lock semantics: dueDate is purely informational/overdue-tracking, an invoice is
// payable from the moment it's generated.
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    billingCycleId: uuid('billing_cycle_id').references(() => billingCycles.id, { onDelete: 'cascade' }).notNull(),
    // Keeps an IMMEDIATE charge's standalone invoice from being found (and having the
    // monthly plan/utility lines appended to it) by the next MONTHLY_COMBINED generation
    // run for the same unit+cycle — see InvoicesService.findOrCreateInvoice. Both kinds
    // share this same table/shape; this is purely a lookup discriminator.
    source: invoiceSourceEnum('source').default('MONTHLY_COMBINED').notNull(),
    invoiceNumber: varchar('invoice_number', { length: 64 }).notNull(),
    totalAmount: doublePrecision('total_amount').notNull(),
    amountPaid: doublePrecision('amount_paid').default(0).notNull(),
    status: invoiceStatusEnum('status').default('PENDING').notNull(),
    dueDate: date('due_date').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoices_society_invoice_number_idx').on(table.societyId, table.invoiceNumber),
    pgPolicy('tenant_isolation_invoices', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();

// The itemized breakdown of an invoice — this is what turns "one combined bill" into
// something the tenant can actually see is maintenance + tanker water + a fine, not just a
// lump sum. adhocChargeId/billingPlanId are back-references for traceability (nullable
// since exactly one of them is ever set per line, never both).
export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    category: chargeCategoryEnum('category').default('OTHER').notNull(),
    amount: doublePrecision('amount').notNull(),
    adhocChargeId: uuid('adhoc_charge_id').references(() => adhocCharges.id, { onDelete: 'set null' }),
    billingPlanId: uuid('billing_plan_id').references(() => billingPlans.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy('tenant_isolation_invoice_line_items', {
      for: 'all',
      using: superadminOrParentRowVisible(table.invoiceId, sql`select id from ${invoices}`),
      withCheck: superadminOrParentRowVisible(table.invoiceId, sql`select id from ${invoices}`),
    }),
  ],
).enableRLS();

// One row per payment attempt (RAZORPAY) or admin-recorded collection (MANUAL/OFFLINE).
// rawResponse keeps the full Razorpay order/payment payload for audit/debugging without
// needing extra columns for whatever fields Razorpay happens to return.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
    amount: doublePrecision('amount').notNull(),
    method: paymentMethodEnum('method').default('RAZORPAY').notNull(),
    status: paymentStatusEnum('status').default('CREATED').notNull(),
    razorpayOrderId: varchar('razorpay_order_id', { length: 128 }),
    razorpayPaymentId: varchar('razorpay_payment_id', { length: 128 }),
    razorpaySignature: varchar('razorpay_signature', { length: 512 }),
    rawResponse: jsonb('raw_response'),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payments_razorpay_order_id_idx').on(table.razorpayOrderId),
    pgPolicy('tenant_isolation_payments', {
      for: 'all',
      using: superadminOrOwnSociety(table.societyId),
      withCheck: superadminOrOwnSociety(table.societyId),
    }),
  ],
).enableRLS();
