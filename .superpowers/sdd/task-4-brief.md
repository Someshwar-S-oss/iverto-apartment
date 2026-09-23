# Task 4 Brief: Frontend Resident Billing Dashboard Redesign

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files to modify:
- `frontend/src/pages/resident/BillingPage.tsx`

## Requirements
1. **Role-Aware Header & Landlord Multi-Unit Switcher**:
   - Access `contexts`, `activeContext`, and `switchContext` from `useRole()`.
   - Compute `unitContexts = contexts.filter((c) => c.type === 'UNIT')`.
   - If `unitContexts.length > 1`:
     - Render a sleek, horizontal tab/pill switcher at the top:
       e.g., `[ Flat 101 • Tower A (Owner) ] [ Flat 204 • Tower B (Owner) ]`
     - Clicking a pill calls `switchContext(ctx.id)`. The active pill has primary highlighted styles (`bg-brand text-white` or `bg-[#cd0447] text-white`).
   - In the PageHeader or header banner:
     - Display active unit details (`Flat ${unitNumber}`, building name, society name).
     - Display role badge:
       - `OWNER` -> Indigo badge (`Owner`)
       - `TENANT` -> Amber badge (`Tenant`)
       - `FAMILY` -> Sky badge (`Family Member`)
     - Subtitle explaining role:
       - For Owner: *"Managing maintenance dues and payment records for your owned property."*
       - For Tenant: *"Maintenance & utility bills for your rented residence."*

2. **Metrics & Urgency Alert Bar**:
   - Top KPI cards:
     1. **Total Outstanding**: Total amount due across pending/overdue invoices.
     2. **Urgency Alert Card**:
        - Compute urgency across all pending invoices:
          - If any invoice is overdue (`now > dueDate` or `status === 'OVERDUE'`), show red/rose badge with warning icon: *"₹X Overdue (by Y days) — Please settle to avoid late penalties"*.
          - Else if any invoice is due within 3 days: show amber badge with clock icon: *"Next bill due in Y day(s)"*.
          - Else if totalDue === 0: show emerald badge: *"All dues cleared! No pending payments"*.
          - Else: show neutral/info badge with due date.
     3. **Settled Bills**: Count of settled bills and total amount paid.

3. **Filters & Search**:
   - Search input for filtering invoices by invoice number or period label.
   - Status tabs: `All (${count})`, `Pending / Due (${count})`, `Settled (${count})`.

4. **Enhanced Invoice Cards**:
   - For pending invoices, show modern cards with:
     - Invoice number and period label (e.g. `INV-2026-09-0001` • `Sep 2026`).
     - Urgency badge with relative day count:
       - Overdue: `Overdue by X days` (Rose)
       - Due soon: `Due in X days` (Amber)
       - Upcoming: `Due on [Date]` (Gray)
     - Outstanding amount in bold: `₹X` (if partially paid, show `₹X remaining of ₹Total`).
     - Line items category chips:
       - Maintenance, Utility, Fine, Amenity with appropriate badge styling.
     - Payer attribution banner:
       - If `amountPaid > 0` or payments exist:
         Show: *"Paid ₹Y by [paidByName] ([paidByRole])"*
     - Action buttons:
       - `Pay Now` button with credit card icon (disabled if paying).
       - `View & Receipt` button opening invoice details modal.

5. **History Table Enhancement**:
   - In Settled Invoices table:
     - Columns: Invoice #, Period, Total Amount, Paid Amount, Payer, Paid On, Status, Actions.
     - Payer column: shows `p.paidByName` with role badge or `p.method`.

6. **Preserve Functionality**:
   - Retain existing Razorpay checkout `handlePayNow` and detail modal opening.
   - Ensure clean responsive layout on mobile and desktop.

7. **Verification**:
   - Run `npm run build` in `frontend`.
   - Ensure 0 errors, 0 warnings.

8. **Commit**:
   - Commit with message:
     `feat(resident-billing): add role badges, multi-unit switcher, urgency alerts, and payer tags`
