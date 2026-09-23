# Billing Management Polish & Owner/Tenant Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate billing management with full Owner vs Tenant transparency, payer attribution, downloadable/printable official PDF society receipts, urgency alerts, landlord multi-unit switching, and UI polish across resident and admin portals.

**Architecture:** 
- Backend joins `payments` with `users` and `unitMemberships` to surface payer identity and role (`OWNER`, `TENANT`, `SOCIETY_ADMIN`).
- Server-side PDF generation using `pdfkit` in `BillingReportsService` exposed via `GET /api/v1/mobile/units/:unitId/billing/invoices/:id/receipt`.
- Frontend resident billing upgraded with role-awareness, multi-unit tabs, urgency countdown chips, category badges, and a dual-view printable receipt modal.
- Admin portal upgraded with owner/tenant payment attribution on offline collections.

**Tech Stack:**
- Backend: NestJS, Drizzle ORM, PostgreSQL, PDFKit, Jest
- Frontend: React 18, TypeScript, Tailwind CSS, Lucide icons, Vite

## Global Constraints
- No database schema migrations: use existing `payments`, `users`, `unit_memberships`, `units`, and `invoices` tables and foreign keys.
- Preserve backward compatibility for existing payment records where user info may be absent.
- Ensure strict unit-scoping on receipt generation endpoints via `RequirePermission('billing.view', ScopeType.UNIT)`.

---

### Task 1: Backend Payer Attribution & Offline Payment Enhancement

**Files:**
- Modify: `backend/src/modules/billing/invoices.service.ts`
- Modify: `backend/src/modules/billing/payments.service.ts`
- Modify: `backend/src/controllers/web/billing-admin.controller.ts`
- Test: `backend/src/modules/billing/invoices.service.spec.ts`

**Interfaces:**
- `InvoicesService.getDetail(societyId: string, invoiceId: string)`:
  - Produces: `{ ...invoice, lineItems: InvoiceLineItem[], payments: EnrichedPayment[] }`
  - Where `EnrichedPayment` includes `paidByName`, `paidByEmail`, `paidByRole`, and `note`.
- `PaymentsService.recordManualPayment(societyId, invoiceId, dto, adminUserId)`:
  - Consumes: `dto: { amount: number; method: 'MANUAL' | 'OFFLINE'; note?: string; payerUserId?: string; payerRole?: 'OWNER' | 'TENANT' }`

- [ ] **Step 1: Write the unit test for enriched payments in `invoices.service.spec.ts`**

Update `backend/src/modules/billing/invoices.service.spec.ts` to test that `getDetail` returns payer information (`paidByName` and `paidByRole`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/src/modules/billing/invoices.service.spec.ts` in `backend` directory.
Expected: FAIL because payer joins and properties are not yet implemented.

- [ ] **Step 3: Implement payer joins in `InvoicesService.getDetail` and enhance `recordManualPayment` in `payments.service.ts`**

In `backend/src/modules/billing/invoices.service.ts`:
Join `payments` with `users` (left join) and `unitMemberships` (left join on `payments.paidByUserId = unitMemberships.userId` and `payments.unitId = unitMemberships.unitId`). Map results to return:
```typescript
paidByName: users.name ?? (payments.method === 'MANUAL' || payments.method === 'OFFLINE' ? 'Society Admin' : null),
paidByEmail: users.email ?? null,
paidByRole: unitMemberships.role ?? ((payments.rawResponse as any)?.payerRole ?? 'SOCIETY_ADMIN'),
note: (payments.rawResponse as any)?.note ?? null,
```

In `backend/src/modules/billing/payments.service.ts`:
Update `recordManualPayment` to store `payerUserId` as `paidByUserId` (falling back to `adminUserId`) and record `payerRole`, `note`, and `recordedByAdmin: adminUserId` in `rawResponse`.

In `backend/src/controllers/web/billing-admin.controller.ts`:
Update `RecordManualPaymentDto` to include optional `payerUserId?: string; payerRole?: 'OWNER' | 'TENANT';`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/src/modules/billing/invoices.service.spec.ts` in `backend` directory.
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/modules/billing/invoices.service.ts backend/src/modules/billing/payments.service.ts backend/src/controllers/web/billing-admin.controller.ts backend/src/modules/billing/invoices.service.spec.ts
git commit -m "feat(billing): add payer attribution and offline payment role support"
```

---

### Task 2: Official PDF Receipt Generator Service & Endpoint

**Files:**
- Modify: `backend/src/modules/billing/billing-reports.service.ts`
- Modify: `backend/src/controllers/mobile/mobile-billing.controller.ts`
- Modify: `backend/src/modules/billing/billing.module.ts`
- Test: `backend/src/controllers/mobile/mobile-billing.controller.spec.ts`

**Interfaces:**
- `BillingReportsService.streamInvoiceReceiptPdf(societyId: string, invoiceId: string, res: Response): Promise<void>`
- Route: `GET /api/v1/mobile/units/:unitId/billing/invoices/:id/receipt`

- [ ] **Step 1: Write controller test for receipt endpoint**

In `backend/src/controllers/mobile/mobile-billing.controller.spec.ts`, add test for `GET /invoices/:id/receipt` ensuring unit permission check and streaming response.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/src/controllers/mobile/mobile-billing.controller.spec.ts` in `backend` directory.
Expected: FAIL with route not found.

- [ ] **Step 3: Implement `streamInvoiceReceiptPdf` and the controller route**

In `backend/src/modules/billing/billing-reports.service.ts`:
Implement `streamInvoiceReceiptPdf`:
- Fetch invoice with line items, payments, unit number, building name, society name and address.
- Construct a clean, professional PDF document with PDFKit:
  - Society Header with branding, name, address, receipt generation date.
  - Bill/Receipt Meta: Invoice #, Period, Due Date, Unit Number, Occupant/Payer details.
  - Line Items Table: Sl No, Description, Category, Amount (₹).
  - Status Box: Status (PAID / PARTIALLY PAID / PENDING / OVERDUE), Total Billed, Total Paid, Balance Due.
  - Payment Details: Date, Method, Reference ID, Payer Name & Role.
  - Computer-generated footer note.

In `backend/src/controllers/mobile/mobile-billing.controller.ts`:
Add handler:
```typescript
@Get('invoices/:id/receipt')
@RequirePermission('billing.view', ScopeType.UNIT)
async getReceipt(
  @Param('unitId') unitId: string,
  @Param('id') id: string,
  @Res() res: Response,
) {
  const societyId = await this.resolveSocietyId(unitId);
  const invoice = await this.invoicesService.getDetail(societyId, id);
  if (invoice.unitId !== unitId) {
    throw new NotFoundException(`Invoice ${id} not found for this unit`);
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`);
  await this.billingReportsService.streamInvoiceReceiptPdf(societyId, id, res);
}
```

Ensure `BillingReportsService` is exported by `BillingModule` and injected into `MobileBillingController`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/src/controllers/mobile/mobile-billing.controller.spec.ts` in `backend` directory.
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/modules/billing/billing-reports.service.ts backend/src/controllers/mobile/mobile-billing.controller.ts backend/src/modules/billing/billing.module.ts backend/src/controllers/mobile/mobile-billing.controller.spec.ts
git commit -m "feat(billing): add official society PDF receipt streaming endpoint"
```

---

### Task 3: Frontend API & Types Enrichment

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/billing-resident.api.ts`
- Modify: `frontend/src/api/billing-admin.api.ts`

**Interfaces:**
- `frontend/src/api/types.ts`: Update `Payment` with `paidByName`, `paidByEmail`, `paidByRole`, `note`.
- `billingResidentApi.getReceiptPdfUrl(unitId: string, invoiceId: string): string`
- `billingResidentApi.downloadReceipt(unitId: string, invoiceId: string): Promise<Blob>`

- [ ] **Step 1: Update type definitions in `frontend/src/api/types.ts`**

Add fields to `Payment`:
```typescript
paidByName?: string | null;
paidByEmail?: string | null;
paidByRole?: 'OWNER' | 'TENANT' | 'FAMILY' | 'SOCIETY_ADMIN' | 'UNKNOWN' | null;
note?: string | null;
```
Add `payerUserId` and `payerRole` to `RecordManualPaymentDto`.

- [ ] **Step 2: Add receipt download methods to `frontend/src/api/billing-resident.api.ts`**

Implement:
```typescript
getReceiptUrl: (unitId: string, invoiceId: string): string =>
  `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,

downloadReceiptPdf: async (unitId: string, invoiceId: string): Promise<Blob> => {
  const response = await apiClient.get(
    `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,
    { responseType: 'blob' },
  );
  return response.data;
},
```

- [ ] **Step 3: Update `billing-admin.api.ts`**

Ensure `recordManualPayment` passes `payerUserId` and `payerRole` in payload.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npm run build` in `frontend` directory.
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/api/types.ts frontend/src/api/billing-resident.api.ts frontend/src/api/billing-admin.api.ts
git commit -m "feat(billing): add receipt API methods and enriched payment types"
```

---

### Task 4: Frontend Resident Billing Dashboard Redesign

**Files:**
- Modify: `frontend/src/pages/resident/BillingPage.tsx`

**Features:**
1. Role & Unit Context Header:
   - Displays unit number and role badge (`Owner` in indigo, `Tenant` in amber).
   - Multi-unit quick switch pill tabs if resident owns/belongs to multiple units.
2. Key Metrics & Urgency Alert Bar:
   - Total Outstanding dues.
   - Urgency badge: Overdue countdown (e.g. `Overdue by 4 days`), Due soon alert (e.g. `Due in 2 days`), or All cleared.
   - Total settled bills.
3. Enhanced Invoice Cards:
   - Filter pills (`All`, `Pending`, `Paid`) + Search input.
   - Category badges with icons (🏢 Maintenance, ⚡ Utility, ⚠️ Fine, 🏊 Amenity).
   - Payer attribution banner: `"Paid by Rahul (Tenant) via UPI on Sep 12"`.
   - "Pay Now" with outstanding amount and "View & Receipt" buttons.

- [ ] **Step 1: Implement role-aware header and multi-unit switcher in `BillingPage.tsx`**

Read `contexts` from `useRole()`. Filter for `c.type === 'UNIT'`. If multiple units exist, show tabs allowing switching `switchContext(c.id)`.

- [ ] **Step 2: Implement urgency alerts and category pills**

Calculate days remaining or days overdue using `dueDate`. Render alert chip with appropriate warning color (Rose for overdue, Amber for <=3 days, Gray/Emerald otherwise).

- [ ] **Step 3: Implement search, status filters, and payer attribution on cards**

Allow filtering invoices by status and search by invoice #. If invoice has payments, render the latest successful payment's payer name, role, and method.

- [ ] **Step 4: Verify in browser and check TypeScript build**

Run: `npm run build` in `frontend` directory.
Expected: PASS with zero errors.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/pages/resident/BillingPage.tsx
git commit -m "feat(resident-billing): add role badges, multi-unit switcher, urgency alerts, and payer tags"
```

---

### Task 5: Dual-View Invoice & Official Society Printable Receipt Modal

**Files:**
- Modify: `frontend/src/pages/resident/BillingPage.tsx`

**Features:**
1. Dual-View Tabs in Invoice Details Modal:
   - **Tab 1: Breakdown & History**: Itemized charge list, payments table with payer names/roles and transaction IDs, "Pay Remaining" button.
   - **Tab 2: Official Society Receipt / Tax Invoice**:
     - Formatted receipt view suitable for browser printing.
     - Society header with society name and address.
     - Bill & Unit details: Invoice #, Period, Unit Number, Resident name and role.
     - Line items table and payment stamp.
2. Actions:
   - **Download PDF**: Triggers direct download of the backend-generated PDF receipt.
   - **Print Receipt**: Formatted print view triggering `window.print()`.

- [ ] **Step 1: Build the Official Receipt tab layout inside the modal**

Include society header, invoice metadata, line items summary, payment transaction table, and official verification stamp.

- [ ] **Step 2: Implement "Download PDF" and "Print" handlers**

Add download button invoking `billingResidentApi.downloadReceiptPdf` to trigger a file save, and print button with print styles.

- [ ] **Step 3: Verify modal interactions and test build**

Run: `npm run build` in `frontend` directory.
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/pages/resident/BillingPage.tsx
git commit -m "feat(resident-billing): add dual-view modal with official printable receipt and PDF download"
```

---

### Task 6: Admin Billing Manual Payment & Inspection Polish

**Files:**
- Modify: `frontend/src/pages/admin/BillingPage.tsx`

**Features:**
1. Manual Payment Modal Polish:
   - Add selector: *"Received From"* (`Unit Owner` or `Unit Tenant`).
   - Note field placeholder: *"e.g. Cheque #492819 or UPI reference"*.
2. Invoice Inspection & Payment Table:
   - Display resident name and role pill (`Owner` or `Tenant`) next to payment entries in the invoice details modal.

- [ ] **Step 1: Update Record Manual Payment modal in `admin/BillingPage.tsx`**

Add payer role selector and pass `payerRole` when calling `billingAdminApi.recordManualPayment`.

- [ ] **Step 2: Update payment list rendering in admin invoice inspection**

Render `p.paidByName` and `p.paidByRole` badge in payment logs.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run build` in `frontend` directory.
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/pages/admin/BillingPage.tsx
git commit -m "feat(admin-billing): add owner-tenant attribution to offline payment modal and invoice inspector"
```

---

### Task 7: End-to-End Build, Test Verification & Polish

**Files:**
- All touched files in backend and frontend.

- [ ] **Step 1: Run all backend tests**

Run: `npm test` in `backend` directory.
Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run: `npm run build` in `frontend` directory.
Expected: Vite build succeeds with zero errors.

- [ ] **Step 3: Commit final integration verification**

```bash
git commit --allow-empty -m "chore: verify end-to-end billing polish tests and build"
```
