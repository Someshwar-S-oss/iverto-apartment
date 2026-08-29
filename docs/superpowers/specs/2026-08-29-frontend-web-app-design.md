# Gate Management Platform — Frontend Web Application Specification

**Date:** 2026-08-29  
**Status:** Approved  
**Framework:** React 19 + Vite 6 + TypeScript  
**Styling:** Tailwind CSS v4 (@tailwindcss/vite) + Glassmorphism Design Tokens  
**Icons & Fonts:** Lucide React & Poppins (@fontsource/poppins)  
**Real-Time:** Socket.IO Client (/ws/web & /ws/mobile) + Web Audio API  

---

## 1. Executive Summary

This specification defines the complete architecture, user journeys, screen layouts, design tokens, and API integration for the **Gate Management Platform Web Application**.

The application serves four primary user roles within a unified, multi-context web environment:
1. **Platform Superadmin**: Global society onboarding, device provisioning (M50 Terminals), master admin accounts, and system-wide throughput analytics.
2. **Society Admin / Community Manager**: Society dashboard, building/unit directory, resident & guard provisioning (`<phone>@iverto` temp password flow), domestic staff directory with M50 biometric face enrollment mapping, live entry stream with photo drawer, gate devices, community notices, and complaints helpdesk.
3. **Resident (Owner / Tenant / Family)**: Multi-unit context switcher, real-time incoming visitor approvals with audible chime and 90-second countdown, domestic helper presence tracking ("IN SOCIETY" vs "AWAY"), quick-commerce delivery automation (Blinkit, Zepto, Swiggy windows), 6-digit guest passcodes & QR codes, unit entry log, and community helpdesk.
4. **Guard Gate Kiosk**: High-contrast, touch/keyboard-optimized fullscreen gate console featuring fast unit directory lookup, visitor check-in with webcam photo capture, 1-tap quick delivery check-in with automated rule resolution, 6-digit passcode & QR verification, real-time approval monitor with auto-flipping Green ALLOW / Red DENY cards, and exit logging.

---

## 2. Design System & Tokens (Aligned with `docs/frontend-design-style.md`)

### 2.1 CSS Theme Tokens (`src/index.css`)
```css
@theme {
  --color-primary-start: #cd0447;
  --color-primary-end: #e91e63;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-surface: rgba(255, 255, 255, 0.85);
  --color-bg-start: #fafafa;
  --color-bg-end: #f5f5f5;
  --font-sans: 'Poppins', sans-serif;
}

:root {
  --brand: #cd0447;
  --brand-ring: rgba(205, 4, 71, 0.25);
  --radius-field: 0.75rem;
  --shadow-soft: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
}
```

### 2.2 Core UI Treatments
- **Surfaces**:
  - `.glass`: Translucent white (`rgba(255, 255, 255, 0.85)`), `backdrop-blur(20px)`, 1px border `rgba(255, 255, 255, 0.6)`.
  - `.glass-panel`: 60% opacity, `backdrop-blur(16px)` for sub-surfaces and drawers.
  - `.card`: `border-radius: 20px`, hover lift (`translateY(-4px)`), smooth cubic-bezier transition.
  - `.card-static`: `border-radius: 20px`, no hover lift for dense data tables and logs.
- **Buttons**:
  - Pill-shaped (`border-radius: 9999px`), `font-weight: 500`.
  - `.btn-primary`: Gradient `#cd0447` $\rightarrow$ `#e91e63`, white text, hover lift and shadow.
  - `.btn-secondary`: White background, border `gray-200`, text `gray-700`, hover brand tint.
  - `.btn-danger`: White background, red border, text `red-600`, hover red tint.
  - `.icon-btn`: Square padding, rounded 0.75rem, subtle gray hover tint.
- **Forms**:
  - `.field`: Rounded 0.75rem, border `gray-200`, focus `--brand` border + 3px `--brand-ring`. Mobile font forced at `16px`.
  - `.field-required::after`: Appends brand-colored `*`.
- **Badges**:
  - `.badge`: Pill, `0.6875rem` bold uppercase text.
  - `bg-emerald-50 text-emerald-700 border-emerald-200` (Active / IN / Success)
  - `bg-blue-50 text-blue-700 border-blue-200` (Info / Staff / Resident)
  - `bg-orange-50 text-orange-700 border-orange-200` (Pending / OUT / Warning)
  - `bg-rose-50 text-rose-700 border-rose-200` (Denied / Expired / Suspended)

---

## 3. User Workflows & Screen Architecture

### 3.1 Authentication & Password Lifecycle
1. **Login Screen (`/login`)**:
   - Modern glassmorphic card on subtle CSS-rendered radial backdrop and faint grid.
   - Input: Email + Password / Temp Password (`<phone>@iverto`).
   - Checks `must_change_password` flag from `/api/v1/auth/login`.
2. **Force Password Reset (`/force-change-password`)**:
   - Mandatory screen when `must_change_password === true`.
   - Requires setting a new secure password via `POST /api/v1/auth/change-password`.
   - On success, fetches `/api/v1/mobile/me/contexts` and routes to the primary role workspace.

---

### 3.2 Superadmin Portal (`/superadmin/*`)
1. **Overview (`/superadmin/overview`)**:
   - KPI counters: Total Societies, Total Devices, Total Users, Total Entry Events.
   - Platform health indicator, active society cards, and event throughput metrics.
2. **Societies (`/superadmin/societies`)**:
   - Grid & table view of all registered gated societies.
   - Modal for onboarding new society: Name, Timezone, Address, Master Admin Name, Email, Phone.
   - Generates Master Admin account with default `<phone>@iverto` temp password.
   - Society status toggle: `ACTIVE` $\leftrightarrow$ `SUSPENDED`.
3. **Devices (`/superadmin/devices`)**:
   - Global inventory of M50 / ZKTeco / eSSL / Matrix biometric terminals.
   - Modal to provision new device: Serial Number, Vendor (`M50`), Gate ID, Society ID, Auth Token.
   - Live heartbeat status badge (Online < 5m ago, Offline > 5m ago) and last ping timestamp.

---

### 3.3 Society Admin Portal (`/admin/*`)
1. **Dashboard (`/admin/dashboard`)**:
   - KPI counters: Total Units, Active Staff Inside Society, Total Gate Devices, Today's Entry Events.
   - Live Gate Activity Feed showing recent entries (Staff face scans, Visitors, Deliveries) with real-time updates.
   - Pending approvals and device health summary.
2. **Units & Buildings (`/admin/units`)**:
   - Buildings management modal (Create Building: Name).
   - Units directory table (Building Name, Unit Number, Occupancy, Assigned Residents).
   - Modal to add new Unit under selected building.
3. **User Management (`/admin/users`)**:
   - Table of users across roles: `OWNER`, `TENANT`, `FAMILY`, `GUARD`, `GUARD_SUPERVISOR`, `SOCIETY_ADMIN`.
   - Modal to provision user: Name, Email, Phone, Role, Unit selection (if resident).
   - Generates temporary password `<phone>@iverto` and copies credentials to clipboard.
4. **Domestic Staff & Biometric Enrolment (`/admin/staff`)**:
   - Domestic helper directory (Maids, Cooks, Drivers, Nannies).
   - Modal to create staff and pair with M50 Terminal `facePersonRef` (`UserId` enrolled on hardware).
   - Unit assignment count and live "IN SOCIETY" / "AWAY" badge based on M50 face logs.
5. **Gate Entry Logs (`/admin/gate-logs`)**:
   - Comprehensive society entry/exit stream with filters (Date, Subject Type, Gate).
   - Clickable row opening visitor photo preview drawer (`/api/v1/mobile/entry-events/:id/photo`).
6. **Gate Devices (`/admin/devices`)**:
   - List of gate biometric terminals and bridge services for the society.
   - Heartbeat status, serial numbers, gate mapping.
7. **Notices (`/admin/notices`)**:
   - Society announcement board with create/pin/broadcast capabilities.
8. **Complaints (`/admin/complaints`)**:
   - Helpdesk tickets raised by residents, filterable by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).

---

### 3.4 Resident Portal (`/resident/*`)
1. **Multi-Unit Context Switcher**:
   - Global dropdown in header to switch between flats (e.g. `A-402 Palm Grove (Owner)` vs `B-101 (Tenant)`).
2. **Dashboard (`/resident/dashboard`)**:
   - Quick status cards: Pending Approvals count, Domestic Staff currently inside society, Today's unit entries.
   - Quick action pills: Invite Guest, Manage Staff, Set Delivery Rules.
3. **Approvals (`/resident/approvals`)**:
   - List of pending approval requests with visitor photo, timestamp, purpose, and 1-click Approve / Reject actions.
   - Full history of past decisions.
4. **Staff Management (`/resident/staff`)**:
   - Household staff cards with photo, category (Maid, Cook, Driver), and live status indicator ("Inside Society since 07:14 AM" vs "Away").
   - Modal to assign existing society staff to the unit.
   - Toggle notification preference (`notify: true/false`).
5. **Delivery Rules (`/resident/deliveries`)**:
   - Card per quick-commerce platform (Blinkit, Zepto, Swiggy, Instamart, Amazon, Flipkart, Other).
   - Configurable mode: `ASK_ME` (default), `LEAVE_AT_GATE`, `ALLOW_TO_DOOR`.
   - Time window settings (`windowStart`, `windowEnd`) and `silent` notification toggle.
6. **Guest Passcodes (`/resident/passcodes`)**:
   - Active passcodes list with 6-digit code, QR token, validity window, and usage counter.
   - Modal to generate new passcode (Validity until, Max uses: 1 / Multiple).
   - Shareable digital pass modal and 1-click Revoke button.
7. **Unit Activity Log (`/resident/activity`)**:
   - Timeline of all entry events into the resident's flat with captured photos and timestamps.
8. **Community (`/resident/community`)**:
   - View pinned society notices; create and track personal helpdesk complaints.

---

### 3.5 Guard Gate Kiosk (`/guard/kiosk`)
1. **Fullscreen Gate Console Layout**:
   - Clean, high-contrast, uncluttered design optimized for guard tablets and gate PCs.
   - Header with Gate Name, Guard Name, Online Status, and Current Time.
   - Four large primary action cards:
     - **[ 👤 Log Visitor Entry ]**
     - **[ 📦 Quick Delivery Check-In ]**
     - **[ 🔢 Verify Passcode / QR ]**
     - **[ 🚪 Mark Exit ]**
2. **Live Directory Quick Search**:
   - Real-time search by Unit Number (e.g., "402"), Resident Name, or Masked Phone Number.
   - Shows building, unit, resident list with 1-click "Create Entry for this Unit".
3. **Visitor Entry Modal with Camera**:
   - Unit selection $\rightarrow$ Visitor Name & Phone $\rightarrow$ Mandatory Camera Capture (using webcam or fallback file upload).
   - On submit, creates entry event and triggers 90-second waiting card in real-time queue.
4. **Quick Delivery Check-In Modal**:
   - Select platform chip (Blinkit, Zepto, Swiggy, Instamart, Amazon, etc.) $\rightarrow$ Select Unit.
   - Automatically queries backend delivery permissions:
     - If `LEAVE_AT_GATE` $\rightarrow$ Immediate green message "Auto-Approved: Leave at Gate".
     - If `ALLOW_TO_DOOR` $\rightarrow$ Immediate green message "Auto-Approved: Send to Flat".
     - If `ASK_ME` $\rightarrow$ Captures photo and dispatches approval to resident.
5. **Passcode & QR Verification Modal**:
   - 6-digit code input or QR token camera scanner.
   - Instant verification check: `VALID` (Green), `EXPIRED` (Red), `ALREADY USED` (Red), `REVOKED` (Red).
6. **Real-Time Decision Queue & Auto-Flip**:
   - Live list of pending visitor approvals at this gate.
   - When resident clicks Approve or Reject: card instantly flips to fullscreen **Green "ALLOW ENTRY"** or **Red "DENY - DO NOT ADMIT"** accompanied by synthesized audio chimes.
   - 90s timeout fallback with 1-tap phone dialer link.

---

## 4. Technical Architecture & File Structure

```
frontend/
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                     # Tailwind v4 @theme tokens & glassmorphism utilities
│   │
│   ├── api/                          # Axios API Layer
│   │   ├── client.ts                 # Axios instance with auth headers
│   │   ├── auth.api.ts               # Login, change-password, contexts
│   │   ├── superadmin.api.ts         # Societies, devices, analytics
│   │   ├── society-admin.api.ts      # Dashboard, units, users, staff, logs, devices
│   │   ├── resident.api.ts           # Approvals, staff, deliveries, passcodes, activity
│   │   └── guard.api.ts              # Directory, entry events, passcodes verify, exit
│   │
│   ├── context/                      # State Management
│   │   ├── AuthContext.tsx           # Authentication state & token handling
│   │   ├── RoleContext.tsx           # Multi-unit & active role context switcher
│   │   ├── RealtimeContext.tsx       # Socket.IO client, subscriptions, live events
│   │   └── ToastContext.tsx          # Floating toast notification engine
│   │
│   ├── components/
│   │   ├── ui/                       # Design System Primitives
│   │   │   ├── PageHeader.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── States.tsx            # Skeletons, Empty states, Loaders
│   │   │   ├── Badge.tsx
│   │   │   └── WebcamCapture.tsx     # Guard camera viewfinder with snapshot
│   │   ├── layout/
│   │   │   ├── DashboardLayout.tsx   # Sidebar + Topbar layout
│   │   │   ├── GuardKioskLayout.tsx  # Fullscreen kiosk layout
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   └── real-time/
│   │       ├── IncomingApprovalModal.tsx # Resident 90s countdown approval popup
│   │       └── SoundEffects.ts       # Web Audio API chimes
│   │
│   ├── pages/
│   │   ├── auth/ (LoginPage, ChangePasswordPage)
│   │   ├── superadmin/ (OverviewPage, SocietiesPage, DevicesPage)
│   │   ├── admin/ (DashboardPage, UnitsPage, UsersPage, StaffPage, GateLogsPage, DevicesPage, NoticesPage, ComplaintsPage)
│   │   ├── resident/ (DashboardPage, ApprovalsPage, StaffPage, DeliveriesPage, PasscodesPage, ActivityPage, CommunityPage)
│   │   └── guard/ (KioskPage, VisitorEntryModal, DeliveryModal, PasscodeModal, ExitModal)
│   │
│   └── routes/
│       ├── ProtectedRoute.tsx
│       └── AppRoutes.tsx
```

---

## 5. Non-Functional & Quality Standards
1. **Responsiveness**: Fluid layout across mobile screens (375px+), tablets, laptops, and wide gate desktop monitors (1920px+).
2. **Accessibility**: Visible keyboard focus outlines with `--brand-ring`, high contrast text ratios, and `prefers-reduced-motion` compliance.
3. **Audio-Visual Feedback**: Zero external audio downloads; all approval chimes synthesized via native Web Audio API oscillators.
4. **Camera Fallback**: Supports both direct HTML5 WebRTC webcam feed and file picker upload on devices without camera permissions.
