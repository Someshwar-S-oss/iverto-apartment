# Billing Management Polish & Owner/Tenant Experience Design

**Date**: 2026-09-23  
**Status**: Approved  
**Topic**: Apartment Billing Management Polish, Owner/Tenant Transparency, Receipt Generation & UI Upgrades  

---

## 1. Problem Statement & Objectives

In residential apartment communities, billing management directly impacts resident trust and administrative efficiency. Currently:
1. **Lack of Owner vs. Tenant Attribution**: Invoices are assigned at the unit level, but when payments are made (or recorded offline), there is no visibility into *who* settled the bill (e.g. whether the landlord/owner paid the maintenance or the tenant paid utility/fine dues). This leads to confusion and disputes between landlords and tenants.
2. **Missing Official Receipts / PDF Invoices**: Residents frequently need formal payment receipts and itemized invoices for corporate reimbursement, tax documentation, and rent/HRA verification. No downloadable or printable PDF receipt endpoint exists for residents.
3. **UI / UX Polish Needed**:
   - The resident billing page lacks role awareness (e.g., whether the user is viewing as Owner or Tenant).
   - Landlords owning multiple flats lack an instant unit-switching experience on the billing screen.
   - Status indicators do not communicate urgency (e.g., days remaining until due date, or days overdue).
   - Incomplete information on payment methods and transaction references.

---

## 2. Architecture & Backend Enhancements

### 2.1 Payer Attribution in Invoice Details & Payments
- **Database Joins in `InvoicesService.getDetail`**:
  - Query `payments` associated with the target `invoiceId`.
  - Left join `users` (on `payments.paidByUserId = users.id`) to fetch `name`, `email`, and `phone`.
  - Left join `unitMemberships` (on `unitMemberships.userId = payments.paidByUserId` and `unitMemberships.unitId = payments.unitId`) to retrieve the resident's role at the time (`OWNER`, `TENANT`, `FAMILY`), or flag as `SOCIETY_ADMIN` if the payer was a society administrator.
  - Return enriched payment records:
    ```typescript
    export interface EnrichedPayment {
      id: string;
      amount: number;
      method: 'RAZORPAY' | 'MANUAL' | 'OFFLINE';
      status: 'CREATED' | 'SUCCESS' | 'FAILED';
      razorpayPaymentId?: string | null;
      razorpayOrderId?: string | null;
      paidAt?: Date | null;
      createdAt: Date;
      paidBy?: {
        id: string;
        name: string;
        email: string;
        role: 'OWNER' | 'TENANT' | 'FAMILY' | 'SOCIETY_ADMIN' | 'UNKNOWN';
      } | null;
      note?: string | null;
    }
    ```

### 2.2 Offline/Manual Payment Attribution (`payments.service.ts` & `billing-admin.controller.ts`)
- Extend `RecordManualPaymentDto`:
  ```typescript
  export interface RecordManualPaymentDto {
    amount: number;
    method: 'MANUAL' | 'OFFLINE';
    note?: string;
    payerUserId?: string;
    payerRole?: 'OWNER' | 'TENANT';
  }
  ```
- Store the payer identity in `payments.paidByUserId` (or `rawResponse.payerRole` / `rawResponse.recordedByAdmin`) so the resident invoice accurately displays who handed over the payment.

### 2.3 Official PDF Receipt & Invoice Generation
- **Service (`billing-reports.service.ts` / `invoices.service.ts`)**:
  - Implement `generateInvoiceReceiptPdf(societyId: string, invoiceId: string, res: NodeJS.WritableStream): Promise<void>`.
  - Layout includes:
    - **Header**: Society Name, Address, Generated Date, Official Receipt / Tax Invoice title.
    - **Invoice & Unit Metadata**: Invoice Number, Billing Period, Due Date, Unit Number, Building Name, Resident Name & Role.
    - **Itemized Charges**: Description, Category (Maintenance, Utility, Fine, Amenity), Amount (₹).
    - **Payment Details**: Amount Paid, Outstanding Balance, Payment Status (`PAID`, `PARTIALLY PAID`, `OVERDUE`), Payment Method, Transaction/Reference ID, Date & Time, and Payer Name/Role.
    - **Footer**: Verification note, computer-generated receipt disclaimer.
- **Mobile/Resident Controller Route**:
  - `GET /api/v1/mobile/units/:unitId/billing/invoices/:id/receipt`
  - Guarded by `billing.view@UNIT`.
  - Streams PDF with headers:
    - `Content-Type: application/pdf`
    - `Content-Disposition: inline; filename="receipt-${invoiceNumber}.pdf"`

---

## 3. Frontend Resident Experience Polish (`frontend/src/pages/resident/BillingPage.tsx`)

### 3.1 Role & Context Header
- Show current active unit and role chip:
  - `Flat 302 • Tower B` with role badge: `Owner` (indigo) or `Tenant` (amber).
  - Helper subtitle clarifying responsibility.
- **Landlord Multi-Unit Switcher**:
  - If the resident has multiple unit memberships (`contexts.filter(c => c.type === 'UNIT').length > 1`), render a quick switcher tab bar allowing 1-click switching between flats without navigating away.

### 3.2 Visual Stats & Urgency Indicators
- **KPI Summary Cards**:
  1. **Total Outstanding Due**: Prominent currency display with number of unpaid bills.
  2. **Payment Urgency Alert**:
     - *Overdue*: Rose alert badge indicating days overdue (e.g. `Overdue by 5 days`).
     - *Due Soon*: Amber alert badge indicating days remaining (e.g. `Due in 2 days`).
     - *All Settled*: Emerald badge (`All clear`).
  3. **Settled Bills Count**: Total bills paid in current cycle.

### 3.3 Enhanced Invoice Cards & History Table
- **Category Chips**: Visual icons for each charge category (`MAINTENANCE`, `UTILITY`, `FINE`, `AMENITY`, `OTHER`).
- **Payer Attribution Tag**:
  - For paid/partially paid bills: `"Paid by Rahul (Tenant) via UPI on Sep 12"` or `"Paid by Landlord (Owner)"`.
- **Search & Filters**: Filter by status (`All`, `Pending / Overdue`, `Paid`) and search by invoice number.
- **Actions**:
  - `Pay Now`: Opens checkout modal.
  - `View & Receipt`: Opens comprehensive invoice modal.

### 3.4 Dual-View Invoice & Official Receipt Modal
- **Tab 1: Breakdown & Payments**:
  - Itemized breakdown of charges.
  - Complete payment history with payer name, role, method, and transaction ID.
  - "Pay Remaining Dues" button if outstanding > 0.
- **Tab 2: Official Printable Society Receipt**:
  - Formatted receipt view suitable for printing.
  - Action buttons:
    - `Download PDF Receipt`: Directly downloads the server-rendered PDF.
    - `Print Receipt`: Triggers `window.print()` formatted for paper/PDF.

---

## 4. Frontend Admin Experience Polish (`frontend/src/pages/admin/BillingPage.tsx`)

- **Manual Payment Modal**:
  - When recording offline payment, add a selector: *"Received From"* (Unit Owner vs Unit Tenant).
  - Allows entering cheque number or UPI transaction reference in the note field.
- **Invoice Inspection**:
  - Show the resident name and role next to payment records in the admin invoice detail modal.

---

## 5. Non-Functional & Safety Constraints
- **Zero Schema Migrations Needed**: Uses existing `payments`, `invoices`, `users`, and `unit_memberships` relations.
- **Backward Compatibility**: Any legacy payment without a matching user membership safely defaults to displaying the payment method or admin note.
- **Security & RLS**: PDF generation verifies unit-level authorization (`RequirePermission('billing.view', ScopeType.UNIT)` and unit ID match).

---

## 6. Verification & Testing Plan
1. **Backend Unit Tests**:
   - `invoices.service.spec.ts`: Test enriched payment joins in `getDetail` returning payer role and name.
   - `payments.service.spec.ts`: Test manual payment recording with payer attribution.
   - `billing-reports.service.spec.ts`: Test PDF receipt stream generation.
2. **Frontend UI Verification**:
   - Verify Owner view with multiple units switches cleanly.
   - Verify Tenant view displays accurate payment status and payer attribution.
   - Verify "Download PDF" streams valid PDF and "Print" produces formatted layout.
   - Run linter and build to guarantee no TypeScript or layout regressions.
