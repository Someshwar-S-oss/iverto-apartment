# Task 7 Brief: End-to-End Build, Test Verification & Polish

**Plan File:** `docs/superpowers/plans/2026-09-23-billing-management-polish.md`

## Task Scope
Files across backend and frontend:
- Backend: all billing services, controllers, and tests
- Frontend: types, APIs, resident & admin billing pages

## Requirements
1. **Backend Verification**:
   - Run the complete backend test suite: `npm test` in `backend`.
   - Verify `npx tsc --noEmit` in `backend` exits with 0 errors.
   - Ensure all billing tests (`invoices.service.spec.ts`, `payments.service.spec.ts`, `mobile-billing.controller.spec.ts`, `billing-reports.service.spec.ts`) and existing controller/service specs pass.

2. **Frontend Verification**:
   - Run `npm run build` in `frontend`.
   - Verify Vite production build completes with 0 errors and 0 TypeScript diagnostics.

3. **Git Hygiene & Cleanliness**:
   - Verify working directory is clean with `git status`.
   - Create empty/final verification commit or commit any final polish:
     `chore: verify end-to-end billing polish tests and build`

4. **Report**:
   - Provide summary of test suite results and production build metrics.
