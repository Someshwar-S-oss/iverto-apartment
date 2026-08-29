# Frontend Web Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete React 19 + Vite 6 + Tailwind CSS v4 web application for the Gate Management Platform, supporting Platform Superadmin, Society Admin, Resident, and Guard Gate Kiosk roles with real-time approvals, biometric hardware mapping, and glassmorphic UI.

**Architecture:** A single-page application using React Router v7 with role-guarded context routing, Axios for REST APIs (`/api/v1/web/*`, `/api/v1/mobile/*`, `/api/v1/auth/*`), Socket.IO for sub-second real-time event updates, Web Audio API for zero-asset feedback chimes, and native WebRTC webcam capture for gate visitor logs.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS v4 (@tailwindcss/vite), Lucide React, @fontsource/poppins, Socket.IO Client, Axios.

---

## Global Constraints
- Framework: React 19 + Vite 6 + TypeScript in `frontend/`
- Styling: Tailwind CSS v4 with `@theme` variables in `src/index.css`
- Primary Brand Gradient: `#cd0447` $\rightarrow$ `#e91e63`, fallback `--brand: #cd0447`
- Typography: Poppins font
- Design System: Glassmorphism surfaces (`.glass`, `.card`, `.card-static`), pill buttons (`.btn-primary`, `.btn-secondary`, `.btn-danger`), `.field` inputs with `--brand-ring`
- Roles Supported: Superadmin, Society Admin, Resident (Owner/Tenant/Family), Guard Gate Kiosk

---

### Task 1: Project Scaffolding & Tailwind CSS v4 Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/index.css`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/package.json` with all required dependencies**
```json
{
  "name": "iverto-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fontsource/poppins": "^5.1.0",
    "axios": "^1.7.9",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.3",
    "socket.io-client": "^4.8.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.7.2",
    "vite": "^6.0.5"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.ts` and TypeScript configuration**
- [ ] **Step 3: Create `frontend/src/index.css` with Tailwind v4 `@theme` design tokens and glassmorphism styles**
- [ ] **Step 4: Install dependencies using `npm install` and verify `npm run build` succeeds**

---

### Task 2: Typed API Client & Audio Synthesis Utilities

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.api.ts`
- Create: `frontend/src/api/superadmin.api.ts`
- Create: `frontend/src/api/society-admin.api.ts`
- Create: `frontend/src/api/resident.api.ts`
- Create: `frontend/src/api/guard.api.ts`
- Create: `frontend/src/components/real-time/SoundEffects.ts`

- [ ] **Step 1: Implement Axios client with automatic JWT bearer injection and 401 handling**
- [ ] **Step 2: Implement typed API methods for Auth, Superadmin, Society Admin, Resident, and Guard**
- [ ] **Step 3: Implement Web Audio API feedback synthesizer (`playAllowChime`, `playDenyChime`, `playRingChime`)**

---

### Task 3: Context Providers (Auth, Multi-Unit Context, Socket.IO Real-Time, Toast)

**Files:**
- Create: `frontend/src/context/ToastContext.tsx`
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/context/RoleContext.tsx`
- Create: `frontend/src/context/RealtimeContext.tsx`

- [ ] **Step 1: Implement `ToastContext` with animated floating notifications**
- [ ] **Step 2: Implement `AuthContext` with login, logout, password change, and token persistence**
- [ ] **Step 3: Implement `RoleContext` with auto-routing and context switching**
- [ ] **Step 4: Implement `RealtimeContext` connecting to backend Socket.IO (`/ws/web` & `/ws/mobile`)**

---

### Task 4: Reusable UI Primitives & Layout Shells

**Files:**
- Create: `frontend/src/components/ui/PageHeader.tsx`
- Create: `frontend/src/components/ui/Modal.tsx`
- Create: `frontend/src/components/ui/ConfirmDialog.tsx`
- Create: `frontend/src/components/ui/SearchInput.tsx`
- Create: `frontend/src/components/ui/States.tsx`
- Create: `frontend/src/components/ui/Badge.tsx`
- Create: `frontend/src/components/ui/WebcamCapture.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Create: `frontend/src/components/layout/Topbar.tsx`
- Create: `frontend/src/components/layout/DashboardLayout.tsx`
- Create: `frontend/src/components/layout/GuardKioskLayout.tsx`
- Create: `frontend/src/components/real-time/IncomingApprovalModal.tsx`

- [ ] **Step 1: Build all reusable UI primitives (`PageHeader`, `Modal`, `ConfirmDialog`, `SearchInput`, `States`, `Badge`, `WebcamCapture`)**
- [ ] **Step 2: Build `Sidebar` and `Topbar` with role gating and multi-unit dropdown**
- [ ] **Step 3: Build `DashboardLayout` and fullscreen `GuardKioskLayout`**
- [ ] **Step 4: Build `IncomingApprovalModal` with live 90s countdown progress bar and audio chime**

---

### Task 5: Auth & Mandatory Password Reset Pages

**Files:**
- Create: `frontend/src/pages/auth/LoginPage.tsx`
- Create: `frontend/src/pages/auth/ChangePasswordPage.tsx`
- Create: `frontend/src/routes/ProtectedRoute.tsx`

- [ ] **Step 1: Implement `LoginPage` with glassmorphic styling, background orb animations, and error handling**
- [ ] **Step 2: Implement `ChangePasswordPage` for first-time password resets**
- [ ] **Step 3: Implement `ProtectedRoute` with role and password-change guarding**

---

### Task 6: Superadmin Portal Pages

**Files:**
- Create: `frontend/src/pages/superadmin/OverviewPage.tsx`
- Create: `frontend/src/pages/superadmin/SocietiesPage.tsx`
- Create: `frontend/src/pages/superadmin/DevicesPage.tsx`

- [ ] **Step 1: Implement `OverviewPage` with platform metrics and system throughput counters**
- [ ] **Step 2: Implement `SocietiesPage` with society onboarding modal and status toggle**
- [ ] **Step 3: Implement `DevicesPage` with M50 terminal provisioning modal and online status badges**

---

### Task 7: Society Admin Portal Pages

**Files:**
- Create: `frontend/src/pages/admin/DashboardPage.tsx`
- Create: `frontend/src/pages/admin/UnitsPage.tsx`
- Create: `frontend/src/pages/admin/UsersPage.tsx`
- Create: `frontend/src/pages/admin/StaffPage.tsx`
- Create: `frontend/src/pages/admin/GateLogsPage.tsx`
- Create: `frontend/src/pages/admin/DevicesPage.tsx`
- Create: `frontend/src/pages/admin/NoticesPage.tsx`
- Create: `frontend/src/pages/admin/ComplaintsPage.tsx`

- [ ] **Step 1: Implement `DashboardPage` with live gate feed and key KPI widgets**
- [ ] **Step 2: Implement `UnitsPage` and `UsersPage` with temporary password `<phone>@iverto` creation**
- [ ] **Step 3: Implement `StaffPage` with M50 biometric `facePersonRef` mapping and live presence badges**
- [ ] **Step 4: Implement `GateLogsPage` with clickable visitor photo drawers**
- [ ] **Step 5: Implement `DevicesPage`, `NoticesPage`, and `ComplaintsPage`**

---

### Task 8: Resident Portal Pages

**Files:**
- Create: `frontend/src/pages/resident/DashboardPage.tsx`
- Create: `frontend/src/pages/resident/ApprovalsPage.tsx`
- Create: `frontend/src/pages/resident/StaffPage.tsx`
- Create: `frontend/src/pages/resident/DeliveriesPage.tsx`
- Create: `frontend/src/pages/resident/PasscodesPage.tsx`
- Create: `frontend/src/pages/resident/ActivityPage.tsx`
- Create: `frontend/src/pages/resident/CommunityPage.tsx`

- [ ] **Step 1: Implement `DashboardPage` and `ApprovalsPage` with 1-click Approve/Reject actions**
- [ ] **Step 2: Implement `StaffPage` with domestic staff presence and notification toggles**
- [ ] **Step 3: Implement `DeliveriesPage` with Blinkit/Zepto/Swiggy delivery rules and time windows**
- [ ] **Step 4: Implement `PasscodesPage` with 6-digit code generator, QR pass modal, and revoke**
- [ ] **Step 5: Implement `ActivityPage` and `CommunityPage`**

---

### Task 9: Guard Gate Kiosk & Interactive Modals

**Files:**
- Create: `frontend/src/pages/guard/KioskPage.tsx`
- Create: `frontend/src/pages/guard/VisitorEntryModal.tsx`
- Create: `frontend/src/pages/guard/DeliveryModal.tsx`
- Create: `frontend/src/pages/guard/PasscodeModal.tsx`
- Create: `frontend/src/pages/guard/ExitModal.tsx`

- [ ] **Step 1: Implement `KioskPage` with high-contrast 4-tile layout, directory quick search, and live pending queue**
- [ ] **Step 2: Implement `VisitorEntryModal` with webcam capture and instant resident approval dispatch**
- [ ] **Step 3: Implement `DeliveryModal` with 1-tap platform selector and auto-rule check**
- [ ] **Step 4: Implement `PasscodeModal` with 6-digit & QR verification**
- [ ] **Step 5: Implement `ExitModal` and full-screen Green ALLOW / Red DENY state flips**

---

### Task 10: App Routes Assembly, Build Verification & Quality Assurance

**Files:**
- Create: `frontend/src/routes/AppRoutes.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Assemble complete routing tree in `AppRoutes.tsx`**
- [ ] **Step 2: Run `npm run build` in `frontend/` to verify zero TypeScript or bundling errors**
- [ ] **Step 3: Verify responsive layout on mobile, tablet, and wide desktop viewports**
