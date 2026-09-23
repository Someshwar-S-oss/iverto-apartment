# Task 5 Report: Dual-View Invoice & Official Society Printable Receipt Modal

## Status
**DONE**

## Commit
`26297909d4d939db2b2ba9ac0614436c6639494e`
Message: `feat(resident-billing): add dual-view modal with official printable receipt and PDF download`

## Files Modified
- `frontend/src/pages/resident/BillingPage.tsx`

---

## Implemented Features

### 1. Dual-View Modal Tabs
- Introduced modal tab bar with two tabs:
  - **Tab 1: "Breakdown & Payments"** (with `Receipt` icon)
  - **Tab 2: "Official Society Receipt"** (with `FileText` icon)
- Active tab state defaults to `"Breakdown & Payments"` and resets to `"breakdown"` whenever an invoice modal is opened or closed.
- Expanded modal size to `xl` for comfortable two-column receipt display and data density.

### 2. Tab 1: Breakdown & Payments
- **Itemized Charges Breakdown**:
  - Description, Category badges (`MAINTENANCE`, `UTILITY`, `FINE`, `AMENITY`), Amount formatted with `₹`.
  - Subtotal / Total Invoiced Amount row.
- **Financial Summary Metrics (4-Box Grid)**:
  - Total Invoiced, Paid Amount, Outstanding Balance (with conditional red/green color coding), and Due Date.
- **Payment History Section**:
  - Displays each payment record with:
    - Payer Name (`p.paidByName || occupantName`)
    - Role Badge (`renderRoleBadge(p.paidByRole)` -> `OWNER`, `TENANT`, `SOCIETY_ADMIN`, etc.)
    - Payment method (`RAZORPAY`, `MANUAL`, `OFFLINE`)
    - Transaction / Order ID / note
    - Formatted timestamp (`formatDateTime` with date and time)
    - Amount formatted with `₹`
  - Clean empty state when no payments are recorded yet.

### 3. Tab 2: Official Society Receipt
- **Society Header**:
  - Bold, prominent Society Name
  - Society Address
  - "OFFICIAL MAINTENANCE BILL & PAYMENT RECEIPT" header
  - Generated / Print Date
- **Two-Column Details Grid**:
  - Left column: Unit No / Flat (Building Name), Resident / Occupant, Role (Owner / Tenant)
  - Right column: Invoice #, Billing Period, Due Date, and angled Payment Status Stamp (`PAID` [green stamp], `PARTIALLY PAID` [blue stamp], `OVERDUE` [red stamp], `PENDING` [amber stamp])
- **Clean Itemized Table of Charges**:
  - Serial #, Description, Category chip, and Amount (₹)
  - Total Invoiced Amount row
- **Payment Settlement History Table** (when payments exist):
  - Date, Method, Txn Reference ID, Payer Name & Role, Amount Paid
- **Summary Box**:
  - Total Invoiced Amount, Total Paid, and Balance Outstanding
- **Disclaimer / Verification Text**:
  - *"This is a computer-generated tax invoice and payment receipt issued by [Society Name] via Iverto Apartment Management."*

### 4. Modal Action Bar & Print Styles
- **Download PDF Receipt**:
  - Calls `billingResidentApi.downloadReceiptPdf(unitId, selectedInvoice.id)`
  - Initiates file download `receipt-${selectedInvoice.invoiceNumber}.pdf` using Blob object URL.
  - Shows loading spinner (`Loader2`) and disabled state while downloading.
- **Print Receipt**:
  - Switches to receipt tab if needed and triggers `window.print()`.
  - Includes `@media print` scoped stylesheet that hides background page, modal chrome, buttons, and prints `#official-society-receipt` full-width with crisp print layout.
- **Pay Now**:
  - Launches Razorpay checkout for outstanding balance when `outstanding > 0`.

---

## Verification
- **Command**: `npm run build` in `frontend` directory.
- **Result**: Success (exit code 0), TypeScript check passed with 0 errors, Vite production bundle generated cleanly in 5.00s.
