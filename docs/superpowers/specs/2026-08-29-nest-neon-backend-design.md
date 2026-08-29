# Gate Management Platform — Backend Specification (NestJS + Neon PostgreSQL)

**Status:** Approved (Updated with Superadmin, RLS, Neon Image Storage & Temp-Password Flow)  
**Date:** 2026-08-29  
**Target Hardware:** M50 Face Recognition Biometric Terminal (Direct-to-Cloud WebSocket)  
**Database:** Neon Serverless PostgreSQL with Drizzle ORM & Postgres Row-Level Security (RLS)  
**Framework:** NestJS (TypeScript)  
**Client Surface:** Distinct `/api/v1/mobile/*` (Resident & Guard App) and `/api/v1/web/*` (Superadmin & Society Admin Dashboard) endpoints  

---

## 1. Executive Summary & Core Updates

This specification details the backend architecture for a high-reliability gated community access control platform. 

### Key Adjustments in this Version:
1. **Platform Superadmin Role**: Superadmin access for onboarding society clients, provisioning and monitoring devices globally, viewing platform-wide analytics, and exercising universal administrative overrides.
2. **Neon Row-Level Security (RLS)**: Enforcing strict tenant isolation at the database engine level using Postgres RLS policies keyed on `current_setting('app.current_society_id', true)` and `current_setting('app.current_user_id', true)`, with a superadmin bypass policy.
3. **Password-Based Onboarding & Mandatory First-Time Reset**:
   - No SMS OTP in initial pilot phase.
   - Admin creates users (Owners, Tenants, Guards, Society Admins) with **Email** as login identifier.
   - Default temporary password format: `<phone_number>@iverto` (e.g., `9876543210@iverto`).
   - `must_change_password: true` flag enforced via middleware/guards. Users must reset their password on first login before accessing any protected resources.
4. **Direct-to-Cloud M50 Terminal Gateway**: Real-time XML streaming (`TimeLog_v2`) over raw WebSocket on `/m50` with offline recovery.
5. **Visitor Image Storage**: Stored and served via Neon-backed asset storage / binary payloads with presigned delivery.

---

## 2. System Architecture

```
                                  ┌─────────────────────────────────────────┐
                                  │           Clients & Terminals           │
                                  │  Web Superadmin │ Web Admin │ App │ M50 │
                                  └───────┬──────────────┬─────────┬────┬───┘
                                          │              │         │    │
             HTTPS (/api/v1/web/*)        │              │         │    │ Raw WS (/m50)
             Socket.IO (/ws/web)          │              │         │    │ (XML Protocol)
                                          │              │         │    │
                                          │   HTTPS (/api/v1/mobile/*)  │
                                          │   Socket.IO (/ws/mobile)    │
                                          │              │              │
                                          ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NestJS Cloud Backend                                    │
│                                                                                         │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────────────────┐  │
│  │      API Controllers Layer      │   │          Realtime & Gateway Layer           │  │
│  │  • Superadmin: Clients, Analytics│  │  • Socket.IO Gateway (Web & Mobile rooms)   │  │
│  │  • Web Admin: Society, Roster   │   │  • M50 Terminal Server (raw ws on /m50)     │  │
│  │  • Mobile: Residents, Guards    │   │  • SharedHttpIoAdapter (upgrade dispatcher) │  │
│  └────────────────┬────────────────┘   └──────────────────────┬──────────────────────┘  │
│                   │                                           │                         │
│                   └─────────────────────┬─────────────────────┘                         │
│                                         ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                               Core Domain Services                                │  │
│  │  • Auth Service (Email + Temp-Password + Force Change Password Engine)            │  │
│  │  • Dynamic Scoped RBAC Engine (Superadmin, Society Admin, Guard, Resident)        │  │
│  │  • Staff Multi-Unit Fan-Out Service           • Passcode & QR Verification        │  │
│  │  • Delivery Permission Engine                 • Visitor Image Storage Service     │  │
│  │  • M50 Biometric Protocol & Backfill Engine   • Push Notification Service (FCM)   │  │
│  └──────────────────────────────────────┬────────────────────────────────────────────┘  │
│                                         │                                               │
│                                         ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        Neon PostgreSQL + RLS + Drizzle Layer                      │  │
│  │  • Postgres Row-Level Security (RLS) Session Scoping                              │  │
│  │  • Drizzle ORM (Type-safe schema & transactional operations)                      │  │
│  │  • Redis Cache, Token Denylist & Socket.IO Pub/Sub Backplane                      │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema & RLS Policies (Drizzle ORM + Neon)

### 3.1 Tenancy, Identity & Passwords
- **`users`**: 
  - `id` (UUID PK)
  - `email` (VARCHAR UNIQUE, NOT NULL — primary login credential)
  - `phone` (VARCHAR E.164, NOT NULL)
  - `password_hash` (VARCHAR, NOT NULL)
  - `name` (VARCHAR, NOT NULL)
  - `avatar_key` (VARCHAR)
  - `is_superadmin` (BOOLEAN DEFAULT false)
  - `must_change_password` (BOOLEAN DEFAULT true)
  - `status` (`ACTIVE`, `SUSPENDED`)
  - `created_at` (TIMESTAMPTZ DEFAULT NOW())
- **`societies`**: `id` (UUID PK), `name`, `timezone` (default `'Asia/Kolkata'`), `address`, `status` (`ACTIVE`, `INACTIVE`), `created_at`.
- **`buildings`**: `id` (UUID PK), `society_id` (FK `societies`), `name`.
- **`units`**: `id` (UUID PK), `building_id` (FK `buildings`), `unit_number`, UNIQUE(`building_id`, `unit_number`).
- **`unit_memberships`**: `id` (UUID PK), `user_id` (FK `users`), `unit_id` (FK `units`), `role` (`OWNER`, `TENANT`, `FAMILY`), `is_primary` (BOOL), `active_from`, `active_to`.
- **`society_roles`**: `id` (UUID PK), `user_id` (FK `users`), `society_id` (FK `societies`), `role` (`SOCIETY_ADMIN`, `GUARD_SUPERVISOR`, `GUARD`), `active` (BOOL).

### 3.2 Row-Level Security (RLS) Architecture
Every tenant-scoped table (`buildings`, `units`, `staff`, `entry_events`, `approval_requests`, `delivery_permissions`, `passcodes`, `notices`, `complaints`) enforces Postgres RLS:

```sql
-- Enable RLS
ALTER TABLE entry_events ENABLE ROW LEVEL SECURITY;

-- Superadmin Bypass Policy
CREATE POLICY superadmin_all_entry_events ON entry_events
  FOR ALL
  USING (
    current_setting('app.is_superadmin', true) = 'true'
  );

-- Society Tenant Isolation Policy
CREATE POLICY tenant_isolation_entry_events ON entry_events
  FOR ALL
  USING (
    society_id = NULLIF(current_setting('app.current_society_id', true), '')::uuid
  );
```

**NestJS Drizzle RLS Middleware**:
Before executing queries inside a tenant context, the database transaction sets session config:
```typescript
await tx.execute(sql`
  SELECT 
    set_config('app.current_user_id', ${userId}, true),
    set_config('app.current_society_id', ${societyId}, true),
    set_config('app.is_superadmin', ${isSuperadmin ? 'true' : 'false'}, true);
`);
```

### 3.3 Hardware, Staff & Operations Tables
- **`devices`**: `id` (UUID PK), `society_id` (FK `societies`), `gate_id` (FK `gates`), `vendor` (`M50`, `ZKTECO`, `ESSL`, `MATRIX`), `serial_no` (VARCHAR UNIQUE), `auth_token` (VARCHAR hash), `last_heartbeat_at`, `status`.
- **`m50_sync_cursors`**: `serial_no` (VARCHAR PK), `last_log_pos` (INT), `last_log_time` (TIMESTAMPTZ), `updated_at`.
- **`staff`**: `id` (UUID PK), `society_id` (FK `societies`), `name`, `phone`, `staff_type` (`MAID`, `COOK`, `DRIVER`, `NANNY`, `OTHER`), `photo_data` (BYTEA / storage ref), `face_person_ref` (VARCHAR, M50 `UserId`), `status` (`ACTIVE`, `INACTIVE`).
- **`staff_unit_assignments`**: `id` (UUID PK), `staff_id` (FK `staff`), `unit_id` (FK `units`), `notify` (BOOL default true), `active_from`, `active_to`, UNIQUE(`staff_id`, `unit_id`) WHERE `active_to IS NULL`.
- **`entry_events`**: `id` (UUID PK), `society_id` (FK `societies`), `gate_id` (FK `gates`), `unit_id` (FK `units`), `event_source` (`M50_DEVICE`, `GUARD_APP`, `PASSCODE`), `subject_type` (`STAFF`, `VISITOR`, `DELIVERY`, `RESIDENT`), `staff_id` (FK `staff`), `visitor_id` (FK `visitors`), `direction` (`IN`, `OUT`), `occurred_at` (TIMESTAMPTZ), `recorded_at` (TIMESTAMPTZ), `photo_data` (BYTEA / storage key), `guard_user_id` (FK `users`), `idempotency_key` (UUID UNIQUE), `raw_payload` (JSONB).
- **`visitor_images`**: `id` (UUID PK), `entry_event_id` (FK `entry_events` UNIQUE), `image_bytes` (BYTEA / binary chunk in Neon), `mime_type` (VARCHAR), `size_bytes` (INT), `created_at` (TIMESTAMPTZ).
- **`approval_requests`**: `id` (UUID PK), `entry_event_id` (FK `entry_events` UNIQUE), `unit_id` (FK `units`), `status` (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `AUTO_APPROVED`), `decided_by_user_id` (FK `users`), `decided_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ), `created_at`.
- **`delivery_permissions`**: `id` (UUID PK), `unit_id` (FK `units`), `platform` (`BLINKIT`, `ZEPTO`, `SWIGGY`, `INSTAMART`, `AMAZON`, `FLIPKART`, `OTHER`), `mode` (`ASK_ME`, `LEAVE_AT_GATE`, `ALLOW_TO_DOOR`), `window_start` (TIME), `window_end` (TIME), `silent` (BOOL), UNIQUE(`unit_id`, `platform`).
- **`passcodes`**: `id` (UUID PK), `unit_id` (FK `units`), `created_by_user_id` (FK `users`), `code` (CHAR(6)), `qr_token` (UUID UNIQUE), `valid_from`, `valid_until`, `max_uses`, `uses_count`, `revoked` (BOOL).

---

## 4. Authentication, Onboarding & Password Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           User Onboarding & Login Lifecycle                             │
│                                                                                         │
│  1. Admin Provisions User     2. First Login Attempt         3. Password Change Gate    │
│     Email: user@example.com      POST /auth/login               POST /auth/change-pwd   │
│     Phone: 9876543210            { email, password }            { newPassword }         │
│     Temp: 9876543210@iverto            │                               │                │
│     must_change_password=true          ▼                               ▼                │
│                               ┌──────────────────────┐      ┌─────────────────────────┐ │
│                               │ Returns JWT with     │ ───► │ must_change_password    │ │
│                               │ status: PENDING_PWD  │      │ set to FALSE            │ │
│                               └──────────────────────┘      │ Full JWT token issued   │ │
│                                         │                   └─────────────────────────┘ │
│                                         ▼                                               │
│                               ┌──────────────────────┐                                  │
│                               │ PasswordChangeGuard  │                                  │
│                               │ blocks all other APIs│                                  │
│                               └──────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **User Creation**:
   - Admin enters `name`, `email`, `phone`, and assigns unit/role.
   - Server sets initial password hash for `<phone>@iverto` and marks `must_change_password = true`.
2. **Initial Login**:
   - User inputs email and temp password into Web or Mobile app.
   - Server verifies hash. If `must_change_password === true`, response returns `{ accessToken, mustChangePassword: true }`.
3. **PasswordChangeGuard**:
   - Rejects any requests to business endpoints with `403 Password Change Required` until `POST /api/v1/auth/change-password` has succeeded.
4. **Context Swapping**:
   - Once password is updated, client fetches all permitted roles (`GET /api/v1/mobile/me/contexts` or `/api/v1/web/me/contexts`).

---

## 5. Superadmin vs Admin vs Mobile API Surface

### 5.1 Superadmin Endpoints (`/api/v1/web/superadmin/*`)
- `GET    /api/v1/web/superadmin/societies` — List all client societies with metrics
- `POST   /api/v1/web/superadmin/societies` — Provision new society client & master admin
- `PATCH  /api/v1/web/superadmin/societies/:id` — Suspend/activate society
- `GET    /api/v1/web/superadmin/devices` — Global view of all M50 terminals and online statuses
- `POST   /api/v1/web/superadmin/devices` — Register new M50 serial and assign to society/gate
- `GET    /api/v1/web/superadmin/analytics` — Platform-wide throughput, active users, latency logs

### 5.2 Society Admin Web Endpoints (`/api/v1/web/*`)
- `POST   /api/v1/web/auth/login` — Society Admin Login
- `GET    /api/v1/web/societies/:id/dashboard` — Live gate metrics, entries, approvals
- `GET    /api/v1/web/societies/:id/units` — Building & unit directory
- `POST   /api/v1/web/societies/:id/users` — Create Owner/Tenant/Guard with `<phone>@iverto` temp password
- `POST   /api/v1/web/societies/:id/units/bulk` — CSV roster upload
- `GET    /api/v1/web/societies/:id/staff` — Staff management (maids, drivers, cooks)
- `POST   /api/v1/web/societies/:id/staff` — Pair staff with M50 `UserId`
- `GET    /api/v1/web/societies/:id/logs` — Scoped society audit & entry logs

### 5.3 Mobile Endpoints (`/api/v1/mobile/*`)
- `POST   /api/v1/mobile/auth/login` — Login with Email + Password
- `POST   /api/v1/mobile/auth/change-password` — Mandatory initial password reset
- `GET    /api/v1/mobile/me/contexts` — Active memberships (Owner, Tenant, Guard)
- `POST   /api/v1/mobile/me/device-token` — FCM push token registration
- **Resident Unit Actions**:
  - `GET  /api/v1/mobile/units/:id/entry-events` — Live entry history
  - `GET  /api/v1/mobile/units/:id/pending` — Pending approval requests
  - `POST /api/v1/mobile/approvals/:id/decide` — Approve/Reject visitor
  - `GET  /api/v1/mobile/units/:id/staff` — Assigned staff & in-society status
  - `POST /api/v1/mobile/units/:id/staff` — Assign maid/driver to unit
  - `GET  /api/v1/mobile/units/:id/delivery-permissions` — Quick-commerce rules
  - `PUT  /api/v1/mobile/units/:id/delivery-permissions/:platform` — Configure Blinkit/Zepto rule
  - `POST /api/v1/mobile/units/:id/passcodes` — Generate 6-digit guest passcode / QR
- **Guard Gate Actions**:
  - `GET  /api/v1/mobile/gates/:id/directory` — Fast unit search
  - `POST /api/v1/mobile/entry-events` — Log visitor/delivery with photo upload
  - `GET  /api/v1/mobile/entry-events/:id/photo` — Fetch visitor image
  - `POST /api/v1/mobile/passcodes/verify` — Verify guest code
  - `GET  /api/v1/mobile/gates/:id/pending` — Polling fallback for active approvals

---

## 6. M50 Direct WebSocket Protocol Details

- **Path**: `wss://<host>/m50`
- Handled directly in NestJS via `SharedHttpIoAdapter` and raw `ws.Server`.
- **Packet Codec**:
  - XML Envelope with `<Message><Request>...</Request></Message>`
  - Event Stream `<TimeLog_v2>` mapped to `staff` by `UserId`.
  - Offline recovery via `GetGlogPosInfo` $\rightarrow$ `GetFirstGlog` $\rightarrow$ `GetNextGlog`.
  - Fan-out to residents over Socket.IO and FCM upon face match.
