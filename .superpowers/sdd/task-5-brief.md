# Task 5 Brief: Dual-View Invoice & Official Society Printable Receipt Modal

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files to modify:
- `frontend/src/pages/resident/BillingPage.tsx`

## Requirements
1. **Dual-View Modal Tabs**:
   - Inside the invoice modal (`selectedInvoice`), introduce a tab bar at the top:
     - **Tab 1: "Breakdown & Payments"**
     - **Tab 2: "Official Society Receipt"**
   - Active tab state defaults to "Breakdown & Payments".

2. **Tab 1: Breakdown & Payments Content**:
   - Itemized charge line items:
     - Description, Category badge (`MAINTENANCE`, `UTILITY`, `FINE`, `AMENITY`), Amount formatted with `₹`.
     - Subtotal / Total row.
   - Financial Summary: Total Invoiced, Paid Amount, Outstanding Balance, Due Date.
   - Payment History Section:
     - When payments exist: render each payment with:
       - Payment method (`RAZORPAY`, `MANUAL`, `OFFLINE`)
       - Transaction / Order ID / note
       - Timestamp formatted nicely
       - Payer details: Payer Name (`p.paidByName`), Role Badge (`p.paidByRole` -> `OWNER`, `TENANT`, `SOCIETY_ADMIN`), and Amount.
   - Action: "Pay Now" button if balance > 0.

3. **Tab 2: Official Society Receipt Content**:
   - A clean, print-ready formal society invoice/receipt:
     - Society Header:
       - Society Name (bold, prominent)
       - Society Address
       - "OFFICIAL MAINTENANCE BILL & PAYMENT RECEIPT" header
       - Generated / Print Date
     - Two-column details grid:
       - Left: Unit No / Flat (Building Name), Resident / Occupant, Role (Owner / Tenant)
       - Right: Invoice #, Billing Period, Due Date, Payment Status stamp (`PAID` [green stamp], `PARTIALLY PAID` [blue stamp], `OVERDUE` [red stamp], or `PENDING`)
     - Clean itemized table of charges:
       - Serial #, Description, Category, Amount (₹)
     - Total Amount row
     - If payment recorded:
       - Payment Settlement Table: Date, Method, Txn Reference ID, Payer Name & Role, Amount Paid
     - Summary Box:
       - Total Amount, Total Paid, Balance Outstanding
     - Disclaimer / Verification text:
       - *"This is a computer-generated tax invoice and payment receipt issued by [Society Name] via Iverto Apartment Management."*

4. **Action Bar**:
   - **Download PDF Receipt**: Calls `billingResidentApi.downloadReceiptPdf(unitId, selectedInvoice.id)` and initiates file download `receipt-${selectedInvoice.invoiceNumber}.pdf` using Blob object URL. Shows loading spinner or disabled state while downloading.
   - **Print Receipt**: Uses clean print styles (`@media print` or printable container trigger) allowing the user to print directly.
   - **Pay Now**: When balance > 0, launches Razorpay checkout.

5. **Verification**:
   - Run `npm run build` in `frontend`.
   - Verify 0 TypeScript errors and clean styling.

6. **Commit**:
   - Commit with message:
     `feat(resident-billing): add dual-view modal with official printable receipt and PDF download`
