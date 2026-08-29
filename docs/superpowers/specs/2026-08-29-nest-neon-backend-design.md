# Gate Management Platform — Backend Specification (NestJS + Neon PostgreSQL)

**Status:** Approved  
**Date:** 2026-08-29  
**Target Hardware:** M50 Face Recognition Biometric Terminal (Direct-to-Cloud WebSocket)  
**Database:** Neon Serverless PostgreSQL with Drizzle ORM  
**Framework:** NestJS (TypeScript)  
**Client Surface:** Distinct `/api/v1/mobile/*` (Resident & Guard App) and `/api/v1/web/*` (Society Admin Dashboard) endpoints  

---

## 1. Executive Summary & Goals

This specification details the backend architecture for a high-reliability gated community access control platform. The backend connects directly to standalone M50 facial recognition terminals over raw XML WebSockets, handles guard-initiated visitor approvals with photo verification in $<1.5\text{s}$, facilitates staff arrival multi-home push fan-outs, enforces fine-grained scoped RBAC, and maintains clear API separation for Mobile and Web clients.

---

## 2. System Architecture

```
                                  ┌───────────────────────────────┐
                                  │   Clients & Terminals         │
                                  │  Web Admin │ Mobile App │ M50 │
                                  └───────┬───────────┬───────┬───┘
                                          │           │       │
             HTTPS (/api/v1/web/*)        │           │       │ Raw WS (/m50)
             Socket.IO (/ws/web)          │           │       │ (XML Protocol)
                                          │           │       │
                                          │   HTTPS (/api/v1/mobile/*)
                                          │   Socket.IO (/ws/mobile)
                                          │           │
                                          ▼           ▼       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NestJS Cloud Backend                                    │
│                                                                                         │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────────────────┐  │
│  │      API Controllers Layer      │   │          Realtime & Gateway Layer           │  │
│  │  • Mobile: Auth, Resident, Guard│   │  • Socket.IO Gateway (Web & Mobile rooms)   │  │
│  │  • Web: Admin, Analytics, Ops   │   │  • M50 Terminal Server (raw ws on /m50)     │  │
│  │  • Devices: Terminal Mgmt       │   │  • SharedHttpIoAdapter (upgrade dispatcher) │  │
│  └────────────────┬────────────────┘   └──────────────────────┬──────────────────────┘  │
│                   │                                           │                         │
│                   └─────────────────────┬─────────────────────┘                         │
│                                         ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                               Core Domain Services                                │  │
│  │  • Auth & RBAC (Scopes: Society, Unit, Gate)  • Entry Events & Visitor Pipeline   │  │
│  │  • Staff Multi-Unit Fan-Out Service           • Passcode & QR Verification        │  │
│  │  • Delivery Permission Engine                 • Presigned Media S3/R2 Service     │  │
│  │  • M50 Biometric Protocol & Backfill Engine   • Push Notification Service (FCM)   │  │
│  └──────────────────────────────────────┬────────────────────────────────────────────┘  │
│                                         │                                               │
│                                         ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                            Data Access & Storage Layer                            │  │
│  │  • Drizzle ORM (Type-safe schema & queries)                                       │  │
│  │  • Neon Serverless PostgreSQL (Pool with connection caching)                      │  │
│  │  • Redis Cache, Token Denylist & Pub/Sub backplane (ioredis)                      │  │
│  │  • Object Storage (Cloudflare R2 / AWS S3 / MinIO via AWS SDK v3)                 │  │
│  └───────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **NestJS 11+** (TypeScript) | Modular architecture, native dependency injection, decorators, robust WebSocket & microservices support. |
| Database | **Neon Serverless PostgreSQL** | High-performance relational storage, branching, connection pooling, and multi-tenant security. |
| ORM | **Drizzle ORM** | Zero-overhead, end-to-end type safety, native compatibility with Neon serverless driver. |
| Real-time Clients | **Socket.IO + `@socket.io/redis-adapter`** | Low-latency state sync for Guard & Resident apps across clustered server instances. |
| Biometric Hardware | **Raw `ws` WebSocket Server** (`/m50`) | Custom HTTP upgrade listener tailored for M50 terminal XML protocol. |
| Cache & Pub/Sub | **Redis (ioredis)** | Session token denylist, dynamic RBAC permission cache, and event pub/sub. |
| Push Notifications | **Firebase Cloud Messaging (FCM)** | High-priority data-only payloads for full-screen incoming approval intents. |
| Media Storage | **S3-compatible (Cloudflare R2 / AWS S3)** | Presigned PUT/GET URLs for visitor photos (server never buffers raw image bytes). |

---

## 3. Database Schema (Drizzle ORM)

### 3.1 Tenancy, Identity & RBAC
- **`societies`**: `id` (UUID PK), `name`, `timezone` (default `'Asia/Kolkata'`), `address`, `created_at`.
- **`buildings`**: `id` (UUID PK), `society_id` (FK `societies`), `name`.
- **`units`**: `id` (UUID PK), `building_id` (FK `buildings`), `unit_number`, UNIQUE(`building_id`, `unit_number`).
- **`users`**: `id` (UUID PK), `phone` (VARCHAR E.164 UNIQUE), `name`, `avatar_key`, `status` (`ACTIVE`, `SUSPENDED`), `created_at`.
- **`unit_memberships`**: `id` (UUID PK), `user_id` (FK `users`), `unit_id` (FK `units`), `role` (`OWNER`, `TENANT`, `FAMILY`), `is_primary` (BOOL), `active_from`, `active_to`.
- **`society_roles`**: `id` (UUID PK), `user_id` (FK `users`), `society_id` (FK `societies`), `role` (`SOCIETY_ADMIN`, `GUARD_SUPERVISOR`, `GUARD`), `active` (BOOL).

### 3.2 Hardware & Terminals
- **`gates`**: `id` (UUID PK), `society_id` (FK `societies`), `name`, `is_active` (BOOL).
- **`devices`**: `id` (UUID PK), `gate_id` (FK `gates`), `vendor` (`M50`, `ZKTECO`, `ESSL`, `MATRIX`, `OTHER`), `serial_no` (VARCHAR UNIQUE), `auth_token` (VARCHAR hash), `last_heartbeat_at`, `status`.
- **`m50_sync_cursors`**: `serial_no` (VARCHAR PK), `last_log_pos` (INT), `last_log_time` (TIMESTAMPTZ), `updated_at`.

### 3.3 Staff & Multi-Unit Fan-Out
- **`staff`**: `id` (UUID PK), `society_id` (FK `societies`), `name`, `phone`, `staff_type` (`MAID`, `COOK`, `DRIVER`, `NANNY`, `OTHER`), `photo_key`, `face_person_ref` (VARCHAR, M50 `UserId`), `status` (`ACTIVE`, `INACTIVE`), `consent_at`, `retention_until`.
- **`staff_unit_assignments`**: `id` (UUID PK), `staff_id` (FK `staff`), `unit_id` (FK `units`), `notify` (BOOL default true), `active_from`, `active_to`, UNIQUE(`staff_id`, `unit_id`) WHERE `active_to IS NULL`.

### 3.4 Entry Events, Approvals & Delivery Rules
- **`visitors`**: `id` (UUID PK), `society_id` (FK `societies`), `name`, `phone`, `purpose`, `company`, `created_at`.
- **`entry_events`**: `id` (UUID PK), `society_id` (FK `societies`), `gate_id` (FK `gates`), `unit_id` (FK `units`, NULL for society-wide), `event_source` (`M50_DEVICE`, `BRIDGE`, `GUARD_APP`, `PASSCODE`), `subject_type` (`STAFF`, `VISITOR`, `DELIVERY`, `RESIDENT`), `staff_id` (FK `staff`), `visitor_id` (FK `visitors`), `direction` (`IN`, `OUT`), `occurred_at` (TIMESTAMPTZ), `recorded_at` (TIMESTAMPTZ), `photo_key`, `guard_user_id` (FK `users`), `idempotency_key` (UUID UNIQUE), `raw_payload` (JSONB).
- **`approval_requests`**: `id` (UUID PK), `entry_event_id` (FK `entry_events` UNIQUE), `unit_id` (FK `units`), `status` (`PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `AUTO_APPROVED`), `decided_by_user_id` (FK `users`), `decided_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ), `created_at`.
- **`passcodes`**: `id` (UUID PK), `unit_id` (FK `units`), `created_by_user_id` (FK `users`), `code` (CHAR(6)), `qr_token` (UUID UNIQUE), `valid_from`, `valid_until`, `max_uses`, `uses_count`, `revoked` (BOOL).
- **`delivery_permissions`**: `id` (UUID PK), `unit_id` (FK `units`), `platform` (`BLINKIT`, `ZEPTO`, `SWIGGY`, `INSTAMART`, `AMAZON`, `FLIPKART`, `OTHER`), `mode` (`ASK_ME`, `LEAVE_AT_GATE`, `ALLOW_TO_DOOR`), `window_start` (TIME), `window_end` (TIME), `silent` (BOOL), UNIQUE(`unit_id`, `platform`).

### 3.5 Operational & Plumbing Tables
- **`device_tokens`**: `id` (UUID PK), `user_id` (FK `users`), `fcm_token` (VARCHAR UNIQUE), `platform` (`android`, `ios`, `web`), `last_seen_at`.
- **`notifications`**: `id` (UUID PK), `user_id` (FK `users`), `type`, `payload` (JSONB), `entry_event_id` (FK `entry_events`), `sent_at`, `delivered_at`, `read_at`.
- **`notices`**: `id` (UUID PK), `society_id` (FK `societies`), `title`, `body`, `posted_by` (FK `users`), `pinned` (BOOL), `created_at`.
- **`complaints`**: `id` (UUID PK), `society_id` (FK `societies`), `unit_id` (FK `units`), `raised_by` (FK `users`), `category`, `description`, `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`), `assigned_to` (FK `users`), `created_at`.
- **`audit_logs`**: `id` (UUID PK), `actor_user_id` (FK `users`), `action`, `target_type`, `target_id`, `meta` (JSONB), `created_at`.

---

## 4. API Endpoints & Client Separation

### 4.1 Mobile API (`/api/v1/mobile/*`)
- **Authentication & Profile**:
  - `POST /api/v1/mobile/auth/otp/request` — Request phone login OTP
  - `POST /api/v1/mobile/auth/otp/verify` — Verify OTP $\rightarrow$ return `{ accessToken, refreshToken }`
  - `POST /api/v1/mobile/auth/refresh` — Refresh access token
  - `GET  /api/v1/mobile/me/contexts` — List active memberships/roles
  - `POST /api/v1/mobile/me/device-token` — Register/update FCM token
- **Resident Features**:
  - `GET  /api/v1/mobile/units/:id/entry-events` — Paginated unit entry logs
  - `GET  /api/v1/mobile/units/:id/pending` — Undecided approval requests
  - `POST /api/v1/mobile/approvals/:id/decide` — `{ decision: 'APPROVED' | 'REJECTED' }`
  - `GET  /api/v1/mobile/units/:id/staff` — List assigned staff and check-in status
  - `POST /api/v1/mobile/units/:id/staff` — Assign society staff member to unit
  - `DELETE /api/v1/mobile/units/:id/staff/:staffId` — Unassign staff member
  - `GET  /api/v1/mobile/units/:id/delivery-permissions` — Get quick-commerce rules
  - `PUT  /api/v1/mobile/units/:id/delivery-permissions/:platform` — Set platform rule & window
  - `POST /api/v1/mobile/units/:id/passcodes` — Generate 6-digit guest passcode / QR
  - `GET  /api/v1/mobile/units/:id/passcodes` — List active guest invites
  - `DELETE /api/v1/mobile/units/:id/passcodes/:id` — Revoke passcode
  - `GET  /api/v1/mobile/societies/:id/notices` — View community notices
  - `POST /api/v1/mobile/units/:id/complaints` — File maintenance/security complaint
- **Guard Gate Operations**:
  - `GET  /api/v1/mobile/gates/:id/directory` — Fast searchable unit & resident name directory
  - `POST /api/v1/mobile/entry-events` — Create visitor/delivery entry with photo presigned upload
  - `PATCH /api/v1/mobile/entry-events/:id/photo` — Confirm photo uploaded
  - `POST /api/v1/mobile/entry-events/:id/exit` — Mark visitor departure
  - `POST /api/v1/mobile/passcodes/verify` — Validate guest code/QR at the gate
  - `GET  /api/v1/mobile/gates/:id/pending` — Safety-net polling for active approvals

### 4.2 Web Admin API (`/api/v1/web/*`)
- `POST /api/v1/web/auth/login` — Admin login (Email/Password or OTP)
- `GET  /api/v1/web/societies/:id/dashboard` — Live metrics (active visitors, gate throughput, open complaints)
- `GET  /api/v1/web/societies/:id/units` — Manage buildings, units, and resident rosters
- `POST /api/v1/web/societies/:id/units/bulk` — CSV bulk upload of society units & owners
- `GET  /api/v1/web/societies/:id/staff` — Registry of maids, cooks, security staff
- `POST /api/v1/web/societies/:id/staff` — Register staff member & pair with M50 `UserId`
- `GET  /api/v1/web/societies/:id/devices` — Device status, heartbeats, firmware notes
- `POST /api/v1/web/societies/:id/devices` — Provision new M50 terminal serial number
- `GET  /api/v1/web/societies/:id/logs` — Comprehensive audit & entry history with filters
- `POST /api/v1/web/societies/:id/notices` — Publish society broadcast notice
- `PATCH /api/v1/web/complaints/:id` — Update complaint status & assign technician

---

## 5. Direct M50 Terminal Gateway Implementation

### 5.1 Transport & HTTP Upgrade
- Path: `wss://<host>/m50`
- `SharedHttpIoAdapter` attached to NestJS HTTP server intercepts `upgrade` event:
  - Disables Socket.IO `destroyUpgrade` reaping.
  - Passes `/m50` connections to `M50Server` raw `ws.Server`.
  - Enforces 1000ms socket reaping on unhandled upgrade requests.

### 5.2 Handshake & Protocol Flow
1. **Device Registration (`Register`)**: Terminal sends its serial. Server validates `devices` record. Returns generated persistent token.
2. **Device Authentication (`Login`)**: Terminal provides serial and token. Connection is marked authenticated.
3. **Heartbeat (`KeepAlive`)**: Terminal pings every 30s; server updates `last_heartbeat_at` and responds with server timestamp.
4. **Real-time Event Stream (`TimeLog_v2`)**: Face verification pushes `<TimeLog_v2>` XML.
   - Codec extracts `UserId`, `DeviceSerialNo`, `Time`.
   - Maps `UserId` $\rightarrow$ `staff.id` or `users.id`.
   - Inserts `entry_events` row.
   - Enqueues multi-unit fan-out notification job.
5. **Offline Backfill Seeker**:
   - On reconnect, server queries `GetGlogPosInfo` and checks `m50_sync_cursors`.
   - Issues batch `GetFirstGlog` $\rightarrow$ `GetNextGlog` to catch up on buffered scans without loss.

---

## 6. Core Flow Guarantees & Real-Time Pipeline

1. **Staff Multi-Home Fan-Out**:
   - Query: `SELECT unit_id FROM staff_unit_assignments WHERE staff_id = $1 AND notify = true AND active_to IS NULL`.
   - Single database query resolves all target units.
   - Multicast FCM push + Socket.IO room emit (`unit:{unitId}`). Total delay from face scan to resident push $< 1.5\text{s}$.
2. **Visitor Approval Race Condition Protection**:
   - Handled via atomic SQL update:
     ```sql
     UPDATE approval_requests
     SET status = $1, decided_by_user_id = $2, decided_at = NOW()
     WHERE id = $3 AND status = 'PENDING'
     RETURNING *;
     ```
   - First user wins; subsequent clicks receive error/resolved state.
   - Instant Socket.IO event dispatched to `gate:{gateId}` room, flipping guard screen to Green/Red.

---

## 7. Security, Reliability & Compliance

- **Stateless Tokens**: Scoped dynamic permissions evaluated per-request against Redis `perms:{userId}` (5-min TTL, evicted on role edit).
- **Masked Guard Privacy**: Guards cannot access full phone numbers or resident delivery rules for other units.
- **Presigned Uploads**: Direct S3/R2 PUT URLs with 5-min TTL.
- **Rate Limits**: OTP 5/hr/phone, Approvals 30/min/user, M50 gateway authenticated by serial + cryptographic token.
