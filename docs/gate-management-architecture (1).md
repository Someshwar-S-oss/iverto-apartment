# Gate Management Platform — Architecture Plan (Pilot)

**Scope:** One mobile app (RBAC-driven) + cloud backend + one standalone face-recognition terminal per gate (face auth + timestamp only).
**Explicitly out of scope for this build:** RFID/boom barrier, ANPR/number-plate, staff rating, staff background verification, staff payroll, e-commerce OTP-less auto-approval, IVR, SMS, WhatsApp, escalation-to-alternate-resident, all premium/paid tooling, DPDP compliance work.

---

## 1. System Overview

```
                          ┌──────────────────────────────┐
                          │   SINGLE MOBILE APP (RBAC)   │
                          │  Owner │ Tenant │ Family │   │
                          │  Guard │ Society Admin       │
                          └───────────────┬──────────────┘
                                          │ HTTPS (REST) + WSS (realtime)
                                          │ FCM (push)
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLOUD BACKEND (API Tier)                        │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ Auth &     │ │ Entry /    │ │ Fan-out &   │ │ Realtime Hub        │  │
│  │ RBAC Svc   │ │ Approval   │ │ Notification│ │ (WebSocket + Redis  │  │
│  │            │ │ Svc        │ │ Svc         │ │  pub/sub backplane) │  │
│  └────────────┘ └────────────┘ └─────────────┘ └─────────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ Staff &    │ │ Delivery   │ │ Device      │ │ Media Svc           │  │
│  │ Assignment │ │ Permission │ │ Gateway     │ │ (presigned uploads) │  │
│  │ Svc        │ │ Svc        │ │ (adapters)  │ │                     │  │
│  └────────────┘ └────────────┘ └─────────────┘ └─────────────────────┘  │
└───────┬──────────────────┬───────────────────┬──────────────────┬───────┘
        │                  │                   │                  │
   ┌────▼─────┐      ┌─────▼──────┐     ┌──────▼──────┐    ┌──────▼──────┐
   │PostgreSQL│      │   Redis    │     │Object Store │    │  Worker     │
   │ (source  │      │ cache +    │     │ (guard      │    │  Queue      │
   │ of truth)│      │ pub/sub    │     │  photos)    │    │  (fan-out)  │
   └──────────┘      └────────────┘     └─────────────┘    └─────────────┘
        ▲
        │ normalized events (HTTPS, idempotent, buffered)
        │
┌───────┴───────────────────────────────────────────┐
│              GATE BRIDGE (per gate)               │
│   Android tablet or Raspberry Pi                  │
│   • speaks vendor protocol to the FR terminal     │
│   • normalizes → {person_ref, IN/OUT, timestamp}  │
│   • local SQLite buffer for offline               │
└───────┬───────────────────────────────────────────┘
        │ vendor SDK / local TCP / device push
        ▼
┌───────────────────────────┐
│  STANDALONE FR TERMINAL   │  ← authenticates face, emits person_ref + time.
│  (ZKTeco / eSSL / Matrix) │     No access-control logic lives here.
└───────────────────────────┘
```

**Design principle:** the FR terminal is a *sensor*, not a decision-maker. It answers exactly one question — "who is this, and when" — and every policy decision (notify whom, allow whom, log what) happens in the cloud. This keeps you vendor-independent and lets you swap terminals without touching business logic.

---

## 2. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native (bare workflow, TypeScript)** | One codebase for Android + iOS, and your React experience transfers directly. Bare workflow — not Expo Go — because you need native modules for full-screen approval intents and background FCM handling. |
| Backend | **Python + FastAPI** | Async-native, which you need for WebSockets + concurrent gate events. Pydantic gives you request/response validation for free. Close enough to Flask that the jump is a day's work. |
| Database | **PostgreSQL 16** | Relational multi-tenancy, strong constraints, JSONB for raw device payloads. |
| Cache / pub-sub | **Redis 7** | Session cache, permission cache, WebSocket backplane, and job broker. |
| Background jobs | **ARQ** (Redis-native, async) or Celery | Fan-out notifications, photo post-processing, retries. ARQ fits FastAPI's async model better. |
| Object storage | **S3-compatible** (MinIO for pilot, Cloudflare R2 / AWS S3 later) | Guard-captured photos; presigned URLs mean photo bytes never touch your API server. |
| Push | **Firebase Cloud Messaging** | Only push channel available after your cuts — see §7. |
| Realtime | **WebSocket (FastAPI) + Redis pub/sub** | Guard app must see approve/reject in <1s. |
| Gate Bridge | **Python on Raspberry Pi 4** | Not React Native — see §5.1. The bridge needs raw TCP sockets, vendor SDKs, and a process that never gets killed. Python keeps it in the same language as your backend. |
| Deployment | **Docker Compose on a single VM** for pilot | 500 units ≈ 800 events/day. One 4GB VM is overkill already. Don't touch Kubernetes. |
| Optional web console | **React + Vite** (later) | RWA admin bulk operations are painful on mobile. Shares types, API client, and validation schemas with the RN app via a `packages/shared` workspace. Defer to Phase 3. |

### 2.1 React Native library choices

These are load-bearing decisions, not preferences — each one maps to a requirement elsewhere in this document.

| Concern | Library | Why this one |
|---|---|---|
| Navigation | **React Navigation v7** | Conditional navigator trees per RBAC context (§4.3) are a natural fit — you swap the whole stack on context change. |
| Server state | **TanStack Query** | Built-in refetch-on-foreground, which is exactly the §7 "pending queue on app open" mechanism. |
| Client state | **Zustand** | Auth session, active context, offline queue. Redux is overkill here. |
| Push | **@react-native-firebase/messaging** | The only mature FCM binding. Handles `setBackgroundMessageHandler` for data-only messages. |
| Notification display | **Notifee** | Non-negotiable. FCM alone can't render full-screen approval intents, custom channels, or Android 14 `USE_FULL_SCREEN_INTENT`. This is what makes an approval feel like a call. |
| Camera | **react-native-vision-camera v4** | Guard photo capture + QR passcode scanning from one library. Frame processors if you later want on-device checks. |
| Image compression | **react-native-compressor** | Client-side resize to ~300KB before upload (§6.2). |
| Local DB | **op-sqlite** | Guard app offline queue and cached unit directory. Fast, synchronous JSI API. |
| Key-value | **react-native-mmkv** | Tokens, active context, feature flags. Far faster than AsyncStorage. |
| WebSocket | Native `WebSocket` + **reconnecting logic in a Zustand store** | No library needed; RN's WS is fine. Add exponential backoff and heartbeat yourself. |
| Background tasks | **react-native-background-fetch** | Bridge-independent safety net: periodic pending-approval sync on the resident app. |
| Crash/perf | **Sentry React Native** | Source-mapped RN stack traces. |

**Two native modules you will end up writing:**
1. **OEM autostart deep-link** — opening Xiaomi/Oppo/Vivo battery-optimisation settings pages requires vendor-specific intents. ~60 lines of Kotlin, wrapped for JS. Critical to §7.
2. **Guard kiosk mode** (optional) — screen-pinning so a guard can't navigate away from the pending-visitor screen. Android `startLockTask`.

---

## 3. Data Model

### 3.1 Tenancy & identity

```
societies (id, name, timezone, created_at)
buildings (id, society_id → societies, name)
units      (id, building_id → buildings, unit_number, UNIQUE(building_id, unit_number))

users (id, phone E.164 UNIQUE, name, avatar_key, status, created_at)
        -- one user = one phone number, globally. Never duplicate per society.

unit_memberships (id, user_id, unit_id, role ENUM(OWNER,TENANT,FAMILY),
                  is_primary BOOL, active_from, active_to)
        -- the many-to-many that makes "owner of A + tenant of B" work.

society_roles (id, user_id, society_id, role ENUM(SOCIETY_ADMIN,GUARD_SUPERVISOR,GUARD),
               active BOOL)
```

The key decision here: **`users` is global, roles are scoped rows.** A user's identity is their phone. Everything else — which society, which unit, what they can do — is a scoped grant. This is what fixes the "I need two logins because I'm an admin *and* an owner" complaint from the research.

### 3.2 Gate & device

```
gates   (id, society_id, name, is_active)
devices (id, gate_id, vendor ENUM(ZKTECO,ESSL,MATRIX,OTHER), serial_no UNIQUE,
         bridge_id, last_heartbeat_at, firmware_note)
bridges (id, gate_id, device_token_hash, last_seen_at, app_version)
```

### 3.3 Staff (the moat table)

```
staff (id, society_id, name, staff_type ENUM(MAID,COOK,DRIVER,NANNY,OTHER),
       photo_key, face_person_ref, status ENUM(ACTIVE,INACTIVE), created_at)
        -- face_person_ref = the ID the FR terminal enrolled them under.

staff_unit_assignments (id, staff_id, unit_id, notify BOOL DEFAULT true,
                        active_from, active_to,
                        UNIQUE(staff_id, unit_id) WHERE active_to IS NULL)
```

**One maid row, N unit assignments.** A single face-scan event resolves to one `staff` row, then fans out across `staff_unit_assignments` → all subscribed units. This is the single most important table in the system and the thing no incumbent does properly.

### 3.4 Entry events & approvals

```
entry_events (id, society_id, gate_id, unit_id NULL, event_source ENUM(FACE_DEVICE,GUARD_APP,PASSCODE),
              subject_type ENUM(STAFF,VISITOR,DELIVERY,RESIDENT),
              staff_id NULL, visitor_id NULL,
              direction ENUM(IN,OUT),
              occurred_at TIMESTAMPTZ,          -- authoritative timestamp
              recorded_at TIMESTAMPTZ,          -- when server received it
              photo_key NULL, guard_user_id NULL,
              idempotency_key UUID UNIQUE,      -- dedupe on bridge retry
              raw_payload JSONB)

visitors (id, society_id, name, phone NULL, purpose, company NULL, created_at)

approval_requests (id, entry_event_id, unit_id,
                   status ENUM(PENDING,APPROVED,REJECTED,EXPIRED,AUTO_APPROVED),
                   decided_by_user_id NULL, decided_at NULL,
                   expires_at, created_at)

passcodes (id, unit_id, created_by_user_id, code CHAR(6) , qr_token UUID,
           valid_from, valid_until, max_uses, uses_count, revoked BOOL)

delivery_permissions (id, unit_id, platform ENUM(BLINKIT,ZEPTO,SWIGGY,INSTAMART,
                                                 AMAZON,FLIPKART,OTHER),
                      mode ENUM(ASK_ME,LEAVE_AT_GATE,ALLOW_TO_DOOR),
                      window_start TIME NULL, window_end TIME NULL,
                      silent BOOL DEFAULT false,
                      UNIQUE(unit_id, platform))
```

`occurred_at` vs `recorded_at` matters: the bridge may buffer offline for hours. The device timestamp is what goes in the log; the server timestamp is for debugging sync lag.

### 3.5 Community basics (kept, minimal)

```
notices (id, society_id, title, body, posted_by, pinned, created_at)
complaints (id, society_id, unit_id, raised_by, category, description,
            status ENUM(OPEN,IN_PROGRESS,RESOLVED,CLOSED), assigned_to, created_at)
amenity_bookings (id, society_id, amenity_id, unit_id, booked_by, slot_start, slot_end)
```

### 3.6 Plumbing

```
devices_tokens   (id, user_id, fcm_token, platform, last_seen_at)
notifications    (id, user_id, type, payload JSONB, entry_event_id NULL,
                  sent_at, delivered_at NULL, read_at NULL)
audit_log        (id, actor_user_id, action, target_type, target_id, meta JSONB, created_at)
```

---

## 4. RBAC Design

### 4.1 Model

Permission checks are **`(user, action, scope)`**, never `(user, role)`. Scope is a society, a unit, or a gate.

```python
Permission = tuple[Action, ScopeType]   # e.g. ("approval.decide", "UNIT")

ROLE_GRANTS = {
  "OWNER":        {"approval.decide@UNIT", "staff.assign@UNIT", "passcode.create@UNIT",
                   "delivery_perm.edit@UNIT", "entry.view@UNIT", "member.invite@UNIT",
                   "complaint.create@UNIT", "amenity.book@UNIT"},
  "TENANT":       {"approval.decide@UNIT", "staff.assign@UNIT", "passcode.create@UNIT",
                   "delivery_perm.edit@UNIT", "entry.view@UNIT",
                   "complaint.create@UNIT", "amenity.book@UNIT"},
  "FAMILY":       {"approval.decide@UNIT", "passcode.create@UNIT", "entry.view@UNIT"},
  "GUARD":        {"entry.create@GATE", "photo.capture@GATE", "approval.request@GATE",
                   "passcode.verify@GATE", "directory.read@SOCIETY", "entry.view@GATE"},
  "GUARD_SUPERVISOR": GUARD + {"guard.roster@SOCIETY", "entry.view@SOCIETY"},
  "SOCIETY_ADMIN":{"unit.manage@SOCIETY", "member.manage@SOCIETY", "staff.manage@SOCIETY",
                   "device.manage@SOCIETY", "notice.post@SOCIETY", "entry.view@SOCIETY",
                   "complaint.manage@SOCIETY"},
}
```

Note what GUARD **cannot** do: view resident phone numbers in full, edit entry logs after creation, or see other units' delivery preferences. Guard turnover is high and their device is the least trusted in the system.

### 4.2 Resolution flow

1. JWT carries `user_id` and `jti` only — **no roles baked into the token.** Roles change (tenant moves out, guard is fired) and a stale token must not carry stale power.
2. On each request, backend loads the user's grant set from Redis (`perms:{user_id}`, TTL 300s, invalidated on any membership write).
3. A FastAPI dependency resolves the target scope from the path (`/units/{unit_id}/...` → UNIT scope) and asserts the permission.
4. Every denied check writes to `audit_log`.

### 4.3 App-side role handling

The app fetches a **context list** at login:

```json
{ "user_id": "...", "contexts": [
    {"type":"UNIT","unit_id":"u1","label":"A-402, Palm Grove","role":"OWNER"},
    {"type":"UNIT","unit_id":"u9","label":"B-101, Lake View","role":"TENANT"},
    {"type":"SOCIETY","society_id":"s1","label":"Palm Grove","role":"SOCIETY_ADMIN"}
]}
```

A context switcher in the app header swaps the entire navigation graph. One install, one login, every hat. Guards get a locked single-context shell with no switcher.

---

## 5. Device Integration Layer

### 5.1 Why a Gate Bridge

Indian FR terminals (ZKTeco, eSSL, Matrix) expose their data through vendor-specific paths — a push protocol over HTTP, a local TCP/SDK socket, or polling a local endpoint. None of them are reliable enough to point directly at your cloud, and none buffer sensibly when the gate's internet drops.

The Gate Bridge solves this: a small always-on box at the gate that talks vendor protocol on one side and your clean API on the other.

**Deliberately not React Native.** The bridge needs raw TCP sockets against vendor SDKs, a process that survives indefinitely without a foreground UI, and zero exposure to Android's background-execution limits — three things RN is actively bad at. A **Raspberry Pi 4 running a Python systemd service** costs about the same as a tablet, restarts cleanly on power loss, and shares language and libraries with your backend. Keep RN for the two apps humans touch.

### 5.2 Adapter pattern

```
        ┌──────────────────────────────────────────┐
        │            Gate Bridge Core               │
        │  ┌─────────────────────────────────────┐ │
        │  │ VendorAdapter (interface)           │ │
        │  │   poll() / onPush() → RawEvent      │ │
        │  └──────┬───────────┬──────────┬───────┘ │
        │   ZKTecoAdapter  eSSLAdapter  MatrixAd.  │
        │         └───────────┴──────────┘         │
        │                    ▼                      │
        │           Normalizer → GateEvent          │
        │                    ▼                      │
        │    SQLite outbox (durable, ordered)       │
        │                    ▼                      │
        │    Uploader (batch, retry w/ backoff)     │
        └───────────────────┬──────────────────────┘
                            ▼  POST /v1/gate-events (batch)
```

### 5.3 Normalized event contract

```json
{
  "idempotency_key": "9f2c...-uuid-generated-at-bridge",
  "device_serial": "ZK-8842291",
  "person_ref": "STF-00412",
  "direction": "IN",
  "occurred_at": "2026-08-25T07:14:03+05:30",
  "match_confidence": 0.94,
  "raw": { "...vendor payload preserved as JSONB..." }
}
```

The `idempotency_key` is generated **at the bridge, once**, and reused on every retry. Server does `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING`. Without this, a flaky gate connection produces duplicate maid notifications, which is the fastest way to get residents to mute your app.

### 5.4 Enrolment

Face enrolment happens at the terminal (vendor's own UI) by the society admin or guard supervisor. The admin then binds `person_ref` → `staff.id` in the app via a one-time pairing screen. Unbound `person_ref`s land in an "unrecognised enrolment" queue rather than being silently dropped.

### 5.5 Health

Bridge sends a heartbeat every 60s. No heartbeat for 5 minutes → push alert to society admin + guard supervisor. A dead gate device that nobody notices for three days is a pilot-killer.

---

## 6. Core Flows

### 6.1 Maid arrival — multi-home fan-out (the differentiator)

```
Maid → FR terminal → face matched (person_ref=STF-00412, IN, 07:14:03)
                          │
                    Gate Bridge normalizes + buffers
                          │  POST /v1/gate-events
                          ▼
              [Device Gateway] dedupe on idempotency_key
                          │
              resolve person_ref → staff_id
                          │
              INSERT entry_events (subject_type=STAFF, direction=IN)
                          │
              enqueue job: fanout_staff_event(entry_event_id)
                          │
        ┌─────────────────┴─────────────────┐
        │  Worker: SELECT unit_id FROM       │
        │  staff_unit_assignments            │
        │  WHERE staff_id=? AND notify=true  │
        │  AND active_to IS NULL             │
        └─────────────────┬─────────────────┘
                          │  → units [A-402, A-511, B-207, C-104]
                          ▼
        for each unit → for each active member with entry.view@UNIT
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
        FCM push              WebSocket event (if connected)
        "Lakshmi checked in     → app updates staff card
         at 7:14 AM"              to "IN" in realtime
                          │
                  INSERT notifications rows
```

**Latency budget:** device → resident push in under 3 seconds. The fan-out is a single indexed query plus an FCM multicast — at pilot scale (a maid serving ~8 homes, ~15 recipients) this is one batched call.

**Exit is symmetric.** The same maid scanning OUT closes the loop and gives every household an accurate duration — something no competitor logs reliably.

### 6.2 Unexpected visitor — guard-initiated with photo proof

```
Guard opens app → "New Visitor"
   │
   ├─ selects unit (searchable directory, cached offline)
   ├─ enters name + purpose
   ├─ CAPTURES PHOTO  ← mandatory, cannot skip
   │
   ▼
App compresses photo client-side (~300KB, 1080px long edge)
   │
   ├──► POST /v1/entry-events  (request sent IMMEDIATELY, photo_key reserved)
   │         returns entry_event_id + approval_request_id + presigned PUT url
   │
   └──► PUT photo to object store (parallel, non-blocking)
              │
              └─► on success: PATCH entry_event.photo_key
                       └─► WS "photo.ready" → resident app swaps placeholder
   ▼
Server creates approval_request (status=PENDING, expires_at=now+90s)
   │
   ├──► FCM high-priority data message → all unit members
   ├──► WS broadcast → any member with app open
   │
   ▼
First member to decide wins (row-level lock, single UPDATE ... WHERE status='PENDING')
   │
   ▼  ◄── THIS IS THE CRITICAL PATH ───
Decision written → Redis pub/sub → WS push to GUARD APP
   │
   ▼
Guard screen flips to full-screen GREEN "ALLOW" or RED "DENY — do not admit"
Other unit members' phones update to "Approved by Shane" (no ghost prompts)
```

**The rejection-sync guarantee.** The research showed the category's worst failure is a resident rejecting a visitor and the guard never seeing it. Fix it three ways, belt-and-braces:
1. WebSocket push (sub-second, primary path).
2. Guard app polls `GET /v1/gates/{id}/pending?since=cursor` every 5s as a safety net — the guard's tablet is on gate wifi and always foregrounded, so polling is cheap and honest.
3. The guard app's visitor card **cannot be dismissed** while status is PENDING. It sits there until a decision or expiry arrives. No decision = no admission, by UI design.

### 6.3 Quick-commerce delivery — per-home permission

```
Guard taps "Delivery" → picks platform chip (Blinkit / Zepto / Swiggy / ...) → picks unit → photo
   │
   ▼
Server reads delivery_permissions WHERE unit_id=? AND platform=?
   │
   ├── mode = LEAVE_AT_GATE, within window
   │       → auto-approve, entry_event logged, guard sees "Leave at gate" instruction
   │       → resident gets SILENT notification if silent=true (else normal push)
   │
   ├── mode = ALLOW_TO_DOOR, within window
   │       → auto-approve, guard sees "Send to A-402"
   │
   ├── mode = ASK_ME  (default)
   │       → normal approval_request flow (§6.2)
   │
   └── outside window, whatever the mode
           → falls back to ASK_ME
```

This is the fix for the forced-auto-approval complaint: the permission is granted **by the household, per platform, per time window**, and defaults to ASK_ME. Nobody's phone rings at 11pm because a third party wired an integration behind their back.

### 6.4 Pre-approved guest — passcode / QR

```
Resident → "Invite Guest" → name + validity window → server issues 6-digit code + QR token
   │
   ▼  (resident shares via any channel — OS share sheet, not your problem)
Guest arrives → guard scans QR or types code
   │
   ▼
POST /v1/passcodes/verify → checks validity window, uses_count < max_uses, not revoked
   │
   ├── valid   → auto entry_event, no resident interruption, photo still captured
   └── invalid → guard sees reason (expired / revoked / already used), falls to §6.2
```

### 6.5 Exit & overstay

- Staff exit via face scan (authoritative).
- Visitors/deliveries: guard marks exit, **or** an overstay job flags any `IN` with no matching `OUT` after N hours and pushes a single digest to the guard supervisor.
- No open-ended entries left dangling in the log — that was a named competitor failure.

---

## 7. Notification Reliability (Push-Only)

You cut SMS, IVR, WhatsApp, and escalation. Push is now a **single point of failure** on the one flow that defines the product. This section is not optional.

| Mechanism | Purpose | React Native implementation |
|---|---|---|
| FCM **high-priority data messages** (not notification-only) | Wakes the app even in Doze; app renders the alert itself, so you control full-screen behaviour. | `messaging().setBackgroundMessageHandler()` — a Headless JS task. Send `data`-only payloads with `priority: "high"`; **never** include a `notification` block, or Android renders it for you and your handler won't fire. |
| Full-screen intent + custom sound for approvals | Approvals behave like an incoming call, not a marketing ping. Android 14+ requires the `USE_FULL_SCREEN_INTENT` declaration — request it during onboarding. | `notifee.displayNotification()` with `fullScreenAction` + a dedicated high-importance channel. Request the permission via `notifee.requestPermission()` at onboarding. |
| WebSocket while app is foreground | Sub-second, no FCM dependency at all. | Native `WebSocket` in a Zustand store; tear down on `AppState` background, re-establish on foreground. |
| **Pending queue on app open** | `GET /v1/me/pending` on every foreground. If push was lost, the resident sees it the instant they unlock. Badge count is server-truth, not push-count. | TanStack Query `refetchOnWindowFocus` wired to RN's `AppState` — this is nearly free. |
| Delivery receipts | App ACKs receipt → `notifications.delivered_at`. Gives you a real measured delivery rate per society, per OEM. | Fire the ACK from inside the background handler, before rendering. Queue it in MMKV if the ACK itself fails. |
| OEM battery-optimisation onboarding | Xiaomi/Oppo/Vivo/Realme aggressively kill background apps. A one-time guided screen (deep-link to autostart settings) during onboarding recovers most of the loss. **This alone is worth more than any feature on the roadmap.** | Custom native module (§2.1). Detect OEM with `react-native-device-info`, then fire the vendor intent. |
| Guard-side timeout | 90s no decision → guard app shows "No response — call resident?" with a `tel:` dial intent. Not IVR, just the OS dialer. Zero infrastructure. | `Linking.openURL('tel:...')`. |

**The RN-specific trap:** the Headless JS background handler runs in a JS context with a hard execution budget and no guarantee your app's normal providers are initialised. Keep that handler tiny — parse payload, call Notifee, fire ACK, exit. Anything heavier (navigation, query cache, analytics) belongs in the foreground path once the user taps through.

**Instrument this from day one.** Track push-sent → push-delivered → decision-made, split by device OEM. If delivery is under 95% on any OEM you'll know in week one instead of finding out from a 1-star review.

---

## 8. API Surface (representative)

```
POST   /v1/auth/otp/request            {phone}
POST   /v1/auth/otp/verify             {phone, otp} → {access, refresh}
POST   /v1/auth/refresh
GET    /v1/me/contexts                 → RBAC context list (§4.3)
GET    /v1/me/pending                  → undecided approvals + unread count

POST   /v1/gate-events                 [bridge, batch, idempotent]
POST   /v1/bridges/heartbeat           [bridge]

POST   /v1/entry-events                [guard] create visitor/delivery entry
PATCH  /v1/entry-events/{id}/photo     attach photo_key after upload
POST   /v1/entry-events/{id}/exit      [guard] mark exit
GET    /v1/units/{id}/entry-events     [resident] unit log
GET    /v1/gates/{id}/pending          [guard] safety-net poll

POST   /v1/approvals/{id}/decide       {decision: APPROVE|REJECT}

GET    /v1/units/{id}/staff            list assigned staff
POST   /v1/units/{id}/staff            assign existing society staff to this unit
DELETE /v1/units/{id}/staff/{staff_id} unassign
PATCH  /v1/units/{id}/staff/{staff_id} {notify: bool}
POST   /v1/societies/{id}/staff        [admin] create staff + bind person_ref

GET    /v1/units/{id}/delivery-permissions
PUT    /v1/units/{id}/delivery-permissions/{platform}

POST   /v1/units/{id}/passcodes
POST   /v1/passcodes/verify            [guard]
DELETE /v1/passcodes/{id}              revoke

WSS    /v1/ws                          auth via short-lived ticket, not JWT in querystring
```

---

## 9. Offline Behaviour

| Component | Offline strategy |
|---|---|
| **FR terminal** | Matches locally against its own enrolled templates. Keeps working with zero internet. |
| **Gate Bridge** | SQLite outbox, ordered, retried with exponential backoff. Events replay with original `occurred_at`. |
| **Guard app** | Caches unit directory + resident display names in **op-sqlite**. Queues new entry events and photo file paths locally, drained by a sync worker on reconnect (`NetInfo` listener). Shows an explicit **"OFFLINE — approvals unavailable"** banner so the guard falls back to phoning the resident rather than guessing. |
| **Resident app** | Read-only cached entry log + staff status via TanStack Query's persisted cache (MMKV-backed). Approvals require connectivity by definition. |
| **Conflict rule** | Entry events are append-only facts — no merge conflicts possible. Approval decisions are server-authoritative with a single-winner UPDATE. |

---

## 10. Security Baseline

Not a compliance programme — just the floor you need for a pilot to be defensible.

- TLS everywhere; certificate pinning in the guard build.
- JWT: 15-min access, 30-day rotating refresh, revocable by `jti` denylist in Redis.
- Bridge auth: per-device token (hashed at rest), rotatable, scoped to `gate-events` only.
- Photos: presigned PUT for upload, presigned GET (5-min TTL) for viewing. No public bucket, ever.
- Server-side permission check on **every** endpoint. Never trust a client-supplied `unit_id` without a scope assertion.
- Rate limits: OTP request 5/hour/phone, approval decide 30/min/user, gate-events 600/min/bridge.
- Entry events are append-only. Corrections are new rows with a `corrects_event_id`, never UPDATEs.
- Guards see resident *names*, masked phone (`+91 ••••• •4821`), and nothing else.

**One cheap forward-hedge:** add `consent_at TIMESTAMPTZ NULL` and `retention_until DATE NULL` columns to `staff` and `entry_events` now, and leave them unused. When compliance does become someone's job, it's a backfill script instead of a migration across your hottest tables. Costs you two columns today.

---

## 11. Scale & Sizing (Pilot)

| Metric | Pilot estimate |
|---|---|
| Societies | 1–3 |
| Units | ~500 |
| Users | ~1,800 |
| Staff | ~150 |
| Gate events/day | ~800–1,200 |
| Peak events/min | ~15 (7–9am staff rush) |
| Photos/day | ~400 @ 300KB → ~120 MB/day |
| Push/day | ~4,000 |

**Verdict:** one 4 vCPU / 8GB VM running Postgres + Redis + API + worker + MinIO handles this with room to spare. Your bottleneck at this scale is FCM delivery reliability and guard app UX — not compute. Do not pre-optimise infrastructure.

Postgres indexes that actually matter:
```sql
CREATE INDEX ON staff_unit_assignments (staff_id) WHERE active_to IS NULL;
CREATE INDEX ON entry_events (unit_id, occurred_at DESC);
CREATE INDEX ON entry_events (gate_id, occurred_at DESC);
CREATE INDEX ON approval_requests (unit_id, status) WHERE status = 'PENDING';
CREATE UNIQUE INDEX ON entry_events (idempotency_key);
```

---

## 12. Environments & Delivery

```
local     → Docker Compose (postgres, redis, minio, api, worker)
staging   → same VM, separate compose project + separate DB
prod      → single VM, nightly pg_dump to object storage, 7-day retention
```

- **CI:** GitHub Actions → lint (ruff) + type check (mypy) + pytest → build image → push → deploy on tag.
- **Migrations:** Alembic, forward-only, run as a pre-deploy step.
- **Mobile:** Monorepo (`apps/mobile`, `apps/api`, `apps/bridge`, `packages/shared`). Hermes engine on, `newArchEnabled=true`. Play Console internal testing track for the pilot society, with **separate release tracks for guard and resident builds** — same binary, but staged independently so a resident-app bug can't brick the gate. Use **EAS Build** or a self-hosted GitHub Actions runner; a Mac is only needed once you start iOS.
- **OTA updates:** Expo Updates (works in bare RN) lets you ship JS-only fixes to a live pilot without a Play review cycle. Invaluable during Phase 4 — but never OTA a change to the approval or offline-sync path without a full regression pass.
- **Observability:** structured JSON logs → Loki or plain files for pilot; Sentry for crashes; one Grafana board with four numbers — event ingest rate, push delivery %, approval median latency, bridge heartbeat status.

---

## 13. Build Sequence

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Skeleton** (2 wks) | Monorepo + shared types, auth + OTP, users/units/memberships, RBAC engine, context switcher, conditional navigator trees per role | A tenant and a guard can log into the same APK and see entirely different apps |
| **1 — Gate core** (3 wks) | Gate Bridge + one vendor adapter, entry_events ingest, guard visitor flow with photo, approval request/decide, WS + FCM, rejection sync | Guard raises a visitor, resident rejects, guard's screen turns red in <1s |
| **2 — The moat** (3 wks) | staff + staff_unit_assignments, fan-out worker, multi-home notify, face-event → staff resolution, delivery_permissions with modes/windows, passcodes + QR | One maid scan notifies 8 households; Blinkit at 11pm respects LEAVE_AT_GATE silent mode |
| **3 — Hardening** (2 wks) | Offline queues, overstay job, OEM battery onboarding, delivery-receipt telemetry, entry log filters, notices/complaints | Push delivery ≥95% across Xiaomi/Oppo/Samsung; zero duplicate maid alerts over 7 days |
| **4 — Pilot** (4 wks) | One real society, 100+ units, daily metrics review | Guard adoption ≥90% of entries logged in-app; resident approval median <20s |

---

## 14. Open Decisions

1. **Which FR terminal for the pilot?** Pick one vendor and write one adapter. ZKTeco's push protocol is the best-documented; eSSL is the most common in Indian societies. Buy one unit of each and test the protocol *before* committing the adapter interface.
2. **Do maids get an app?** Current design says no — the face terminal is their entire interface. Revisit only if households demand a "running late" signal.
3. **iOS timeline.** RN makes the resident app close to free on iOS — but not the reliability work. iOS has no full-screen-intent equivalent, so approvals arrive as ordinary notifications with Time Sensitive interruption level (requires an entitlement) or, if you want true call-like behaviour, CallKit via PushKit. Ship Android-only for the pilot, then budget ~2 weeks for iOS notification parity rather than assuming it's a build-target flip. Guards stay Android permanently.
4. **Multi-gate societies.** The schema supports N gates today, but the guard app's gate assignment is a single value — decide whether a guard can float between gates mid-shift.
5. **Photo retention.** Unbounded storage growth is a real cost even at pilot scale. Pick a number (90 days?) and write the cron job before the bucket gets expensive.
