# Task 6 Brief: Admin Billing Manual Payment & Inspection Polish

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files to modify:
- `frontend/src/pages/admin/BillingPage.tsx`

## Requirements
1. **Record Manual / Offline Payment Dialog Enhancement**:
   - In `frontend/src/pages/admin/BillingPage.tsx`, locate the modal for recording manual/offline payment against an invoice.
   - Add state: `payerRole: 'OWNER' | 'TENANT' | ''` (defaults to `'OWNER'`).
   - Add a form field:
     - Label: *"Received From (Resident Role)"*
     - Radio group or select dropdown:
       - `Unit Owner (Landlord)` -> `'OWNER'`
       - `Unit Tenant (Resident)` -> `'TENANT'`
   - Placeholder for Payment Note: *"e.g. Cheque #482910, NEFT/UPI Ref, or Cash receipt no."*
   - When submitting the manual payment, include `payerRole` in payload to `billingAdminApi.recordManualPayment(societyId, invoice.id, { amount, method, note, payerRole: payerRole || undefined })`.
   - Reset `payerRole` state when modal closes.

2. **Invoice Inspection Details Modal**:
   - In the admin invoice details view (when an admin clicks "View Details" on an invoice in the Invoices tab):
     - In the Payments History section:
       - Display the payer details:
         - `p.paidByName` (e.g. "Priya Sharma")
         - Role Badge:
           - `'OWNER'` -> Indigo badge (`Owner`)
           - `'TENANT'` -> Amber badge (`Tenant`)
           - `'SOCIETY_ADMIN'` -> Slate badge (`Admin Recorded`)
         - Payment method badge (`RAZORPAY`, `MANUAL`, `OFFLINE`).
         - Note / Reference ID if available.
     - Add a **"Download PDF Receipt"** button in the invoice inspection modal header or action bar:
       - Uses `billingResidentApi.downloadReceiptPdf(selectedInvoice.unitId, selectedInvoice.id)` to allow admins to download the official society receipt PDF for any unit's invoice.

3. **Verification**:
   - Run `npm run build` in `frontend`.
   - Ensure 0 errors, 0 warnings.

4. **Commit**:
   - Commit with message:
     `feat(admin-billing): add owner-tenant attribution to offline payment modal and invoice inspector`
