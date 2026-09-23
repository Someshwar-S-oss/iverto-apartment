# Task 1 Brief: Backend Payer Attribution & Offline Payment Enhancement

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files to modify:
- `backend/src/modules/billing/invoices.service.ts`
- `backend/src/modules/billing/payments.service.ts`
- `backend/src/controllers/web/billing-admin.controller.ts`
- `backend/src/modules/billing/invoices.service.spec.ts`

## Requirements
1. **Payer Attribution in `InvoicesService.getDetail(societyId, invoiceId)`**:
   - When retrieving payments for an invoice, join `payments` with `users` (left join on `payments.paidByUserId = users.id`) and `unitMemberships` (left join on `payments.paidByUserId = unitMemberships.userId` AND `payments.unitId = unitMemberships.unitId`).
   - Return enriched payment objects containing:
     - `paidByName`: string | null (from `users.name`, falling back to `"Society Admin"` if payment method is `MANUAL` or `OFFLINE` and user name is not found)
     - `paidByEmail`: string | null (from `users.email`)
     - `paidByRole`: `'OWNER' | 'TENANT' | 'FAMILY' | 'SOCIETY_ADMIN' | 'UNKNOWN'` (from `unitMemberships.role`, or from `(payments.rawResponse as any)?.payerRole`, falling back to `'SOCIETY_ADMIN'` for offline/manual recorded by admin, or `'UNKNOWN'`)
     - `note`: string | null (from `(payments.rawResponse as any)?.note ?? null`)
   - Preserve all existing fields on payments: `id`, `societyId`, `invoiceId`, `unitId`, `amount`, `method`, `status`, `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`, `rawResponse`, `paidByUserId`, `paidAt`, `createdAt`.

2. **Offline/Manual Payment Attribution in `PaymentsService.recordManualPayment` and `BillingAdminController`**:
   - Update `RecordManualPaymentDto` in `backend/src/controllers/web/billing-admin.controller.ts` to include:
     ```typescript
     export interface RecordManualPaymentDto {
       amount: number;
       method: 'MANUAL' | 'OFFLINE';
       note?: string;
       payerUserId?: string;
       payerRole?: 'OWNER' | 'TENANT';
     }
     ```
   - In `backend/src/modules/billing/payments.service.ts`:
     - In `recordManualPayment(societyId, invoiceId, dto, adminUserId)`:
       - If `dto.payerUserId` is provided, set `paidByUserId: dto.payerUserId`, else `adminUserId`.
       - In `rawResponse`: store `{ note: dto.note, payerRole: dto.payerRole, recordedByAdmin: adminUserId }`.

3. **Testing**:
   - In `backend/src/modules/billing/invoices.service.spec.ts`:
     - Add/update tests verifying that `getDetail` returns enriched payment information (`paidByName`, `paidByRole`, `note`).
   - Run tests using `npm test -- invoices.service.spec.ts` inside `backend`.
   - Make sure all existing and new tests pass.

4. **Commit**:
   - Once tested, commit the changes with message:
     `feat(billing): add payer attribution and offline payment role support`
