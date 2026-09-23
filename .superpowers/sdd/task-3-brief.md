# Task 3 Brief: Frontend API & Types Enrichment

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files to modify:
- `frontend/src/api/types.ts`
- `frontend/src/api/billing-resident.api.ts`
- `frontend/src/api/billing-admin.api.ts`

## Requirements
1. **Types Update (`frontend/src/api/types.ts`)**:
   - In `Payment` interface:
     - Add `paidByName?: string | null;`
     - Add `paidByEmail?: string | null;`
     - Add `paidByRole?: 'OWNER' | 'TENANT' | 'FAMILY' | 'SOCIETY_ADMIN' | 'UNKNOWN' | null;`
     - Add `note?: string | null;`
   - In `RecordManualPaymentPayload` (or define it if not present):
     - Ensure:
       ```typescript
       export interface RecordManualPaymentPayload {
         amount: number;
         method: 'MANUAL' | 'OFFLINE';
         note?: string;
         payerUserId?: string;
         payerRole?: 'OWNER' | 'TENANT';
       }
       ```

2. **Resident Billing API Update (`frontend/src/api/billing-resident.api.ts`)**:
   - Add method:
     ```typescript
     getReceiptPdfUrl: (unitId: string, invoiceId: string): string =>
       `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,
     ```
   - Add method:
     ```typescript
     downloadReceiptPdf: async (unitId: string, invoiceId: string): Promise<Blob> => {
       const response = await apiClient.get(
         `/api/v1/mobile/units/${unitId}/billing/invoices/${invoiceId}/receipt`,
         { responseType: 'blob' },
       );
       return response.data;
     },
     ```

3. **Admin Billing API Update (`frontend/src/api/billing-admin.api.ts`)**:
   - Verify `recordManualPayment` takes `(societyId: string, invoiceId: string, data: RecordManualPaymentPayload)` and passes all fields (`amount`, `method`, `note`, `payerUserId`, `payerRole`) to `apiClient.post`.

4. **Verification**:
   - Run `npm run build` or `npx tsc --noEmit` in `frontend` directory.
   - Must build with 0 TypeScript diagnostics.

5. **Commit**:
   - Commit changes with message:
     `feat(billing): add receipt API methods and enriched payment types`
