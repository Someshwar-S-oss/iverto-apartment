# iverto Mobile API Documentation

Complete REST and WebSocket API specification for the **iverto Mobile Apps** (Resident App & Guard Console App). All examples and field names in this document are taken directly from the current backend implementation (`backend/src/controllers/mobile/*`, `backend/src/modules/*`) — not the original design spec — so it reflects what actually ships.

---

## 1. Global Specifications

- **Base URL**: `http://<backend-host>:8031/api/v1` (e.g. `http://localhost:8031/api/v1`)
- **Content-Type**: `application/json`
- **Authentication**: Bearer token in the standard HTTP header:
  ```http
  Authorization: Bearer <jwt_access_token>
  ```
  Access tokens still expire after **15 minutes** (`JWT_EXPIRES_IN`) — that hasn't changed, and shouldn't: it's what keeps a stolen access token's blast radius small. What's new is `POST /auth/refresh` (§2.4): exchange a refresh token for a new access token (plus a rotated new refresh token) without a full re-login. `login` (§2.1) and `change-password` (§2.2) both now return a `refreshToken` alongside `accessToken` — store it, and swap it for a fresh pair whenever a request comes back `401` instead of dropping straight to the login screen.

### 1.1. Rate Limiting

All endpoints share a global baseline limit of **120 requests/minute**, keyed **per authenticated account** (`sub` on the bearer token) — not per IP. A gate's own wifi is one IP with a shift's worth of guards and a kiosk behind it; per-IP keying used to treat all of them as a single client. Two endpoints layer a stricter limit on top, because both are realistic brute-force targets:

| Endpoint | Limit | Keyed by |
| :--- | :--- | :--- |
| `POST /api/v1/auth/login` | 8 requests/minute per IP | IP — there's no account yet at login by definition, so this one's unaffected by the account-keying change above |
| `POST /api/v1/mobile/gates/:gateId/passcodes/verify` | 15 requests/minute per account | Authenticated guard account |

A throttled request receives `429 Too Many Requests`. Clients should back off and surface a "too many attempts" message rather than retrying immediately.

### 1.2. Error Response Shape

```json
{
  "statusCode": 400,
  "message": "Error description message or array of validation errors",
  "error": "Bad Request"
}
```

| Status | Meaning in this API |
| :--- | :--- |
| `400 Bad Request` | Missing/invalid request body field. |
| `401 Unauthorized` | Missing/expired/invalid JWT, wrong login credentials, or an invalid passcode/QR token. |
| `403 Forbidden` | Authenticated, but not permitted for this specific unit/gate/society — either the app-level role check failed, or the request was blocked at the database's row-level security layer as a defense-in-depth backstop (see §7). Also returned by `PasswordChangeGuard` when `mustChangePassword` is still `true` and the client calls anything other than `/auth/change-password`. |
| `404 Not Found` | Resource doesn't exist — or exists but belongs to a different unit/society than the caller (see §7; some endpoints intentionally return `404` instead of `403` for cross-tenant lookups, to avoid confirming another tenant's data exists). |
| `409 Conflict` | An approval was already decided (or expired, or belongs to a different unit) by the time this decision arrived — expected under normal concurrent-tap conditions. |
| `429 Too Many Requests` | Rate limit exceeded (see §1.1). |

### 1.3. Tenant Isolation (what changes for API consumers)

Every unit-, gate-, and society-scoped endpoint is authorized twice: once by the application (RBAC — does this user actually hold a role on this unit/gate/society), and independently again at the database via Postgres Row-Level Security. In practice this means:

- A request scoped to a unit/gate/society you don't belong to fails with `403`/`404` *before* your app-layer role check would even normally be consulted for some internal lookups — don't rely on any endpoint "usually" allowing cross-tenant reads just because a similar one used to.
- IDs (`approvalId`, `entryEventId`, passcodes) are UUIDs and not guessable, but they are **not treated as bearer credentials** — deciding an approval, verifying a passcode, or fetching a photo all re-validate that the resource actually belongs to the unit/society context in the URL, not just that the ID resolves to something.

---

### 1.4. Idempotency-Key (retry safety on four writes)

**Honoured now** (was: sent by the client, ignored by the service). Send an
`Idempotency-Key` header on a retry of the same logical action — generated
where the action happened (the guard tapping "Admit"), not freshly per HTTP
attempt — and a retry after a dropped connection replays the original
response instead of re-executing the write:

```http
POST /api/v1/mobile/gates/:gateId/entry-events
Idempotency-Key: 6f1a2b3c-4d5e-...  (any string unique to this one action)
```

| Endpoint | What replaying protects against |
| :--- | :--- |
| `POST /mobile/gates/:gateId/entry-events` | The same visitor logged (and pushed to the resident) twice |
| `POST /mobile/gates/:gateId/entry-events/:id/exit` | A second `OUT` row for one crossing |
| `POST /mobile/units/:unitId/approvals/:id/decide` | A spurious `409` on the client's own retry of an already-successful decision |
| `POST /mobile/gates/:gateId/passcodes/verify` | A single-use passcode's use being spent twice |
| `POST /mobile/units/:unitId/billing/invoices/:id/pay/order` | Two Razorpay orders created for one "Pay Now" tap (e.g. a double-tap or a retried request after a flaky connection) |
| `POST /mobile/units/:unitId/billing/invoices/:id/pay/verify` | The same successful verification (and payment-applied notification) being replayed twice |

Keyed on `(your account, that specific endpoint, the key you sent)` — reusing
the same key value across two different endpoints, or two different
accounts, never collides. Cached for 24 hours; only a *successful* response
is ever cached, so a key retried after a genuine failure gets a real second
attempt, not a replayed error. No header, no behavior change — every one of
these endpoints works exactly as before if you never send one.

---

## 2. Authentication & Session APIs

### 2.1. User Login
Authenticate with registered email and password.

- **Endpoint**: `POST /api/v1/auth/login` (also mounted at `POST /auth/login`)
- **Auth Required**: No
- **Rate Limit**: 8/minute per IP

#### Request Body
```json
{
  "email": "resident@example.com",
  "password": "SecretPassword123"
}
```

#### Response (`200 OK`)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "9f8e7d6c5b4a...",
  "user": {
    "id": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
    "email": "resident@example.com",
    "name": "Arjun Mehta",
    "phone": "9876543210",
    "isSuperadmin": false,
    "mustChangePassword": false
  }
}
```
*(If `mustChangePassword: true`, the client must redirect to the mandatory password-change screen — every other endpoint returns `403` until it succeeds.)*

**`refreshToken` is new** (was: no such field, no refresh flow existed) — store it alongside `accessToken` and use it with §2.4 once the access token expires, instead of dropping back to this screen every 15 minutes.

New users provisioned by a Society Admin get a deterministic temporary password of `<phone_digits>@iverto` (e.g. phone `+91 98765 43210` → `919876543210@iverto`) and always start with `mustChangePassword: true`.

#### Errors
- `401 Unauthorized` — wrong email/password, or the account is `SUSPENDED`.

---

### 2.2. Mandatory First-Login Password Reset
- **Endpoint**: `POST /api/v1/auth/change-password`
- **Auth Required**: Yes (works even while `mustChangePassword` is `true` — this is the one endpoint `PasswordChangeGuard` always allows through)

#### Request Body
```json
{
  "newPassword": "NewSecurePassword123!"
}
```
`newPassword` must be at least 8 characters.

#### Response (`200 OK`)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "9f8e7d6c5b4a...",
  "message": "Password changed successfully",
  "user": {
    "id": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
    "email": "resident@example.com",
    "name": "Arjun Mehta",
    "phone": "9876543210",
    "isSuperadmin": false,
    "mustChangePassword": false
  }
}
```
The response includes a **fresh** access token with `mustChangePassword: false` baked in — replace the stored token with this one immediately; the old token still carries the stale claim until it expires. `refreshToken` is fresh too, and for a reason beyond routine rotation: a password change revokes every refresh token issued before it (every other device gets signed out for real on its next refresh attempt) — store this new one or this device's own next silent refresh fails too.

---

### 2.3. Get My Memberships & Workspaces
Retrieves every unit membership and society role the authenticated user holds — the client uses this to build its "which flat / which gate" context switcher.

- **Endpoint**: `GET /api/v1/mobile/me/contexts`
- **Auth Required**: Yes

#### Response (`200 OK`)
```json
{
  "units": [
    {
      "id": "029e843f-b883-4903-8d0f-62e92cbb3e85",
      "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
      "role": "OWNER",
      "isPrimary": true,
      "unitNumber": "A-402",
      "buildingId": "1904d9e8-482a-460d-838d-1904bb9d83a1",
      "buildingName": "Tower A",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "societyName": "Palm Grove Residences"
    }
  ],
  "societies": [
    {
      "id": "829e928a-492a-43bb-a178-1928374bb901",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "role": "SOCIETY_ADMIN",
      "societyName": "Palm Grove Residences"
    }
  ],
  "gates": [
    {
      "id": "d091838a-274b-4b91-9e2a-8f1a2b3c4d5e",
      "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
      "gateName": "Main Gate",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "societyName": "Palm Grove Residences",
      "role": "GUARD"
    }
  ]
}
```
`role` under `units` is one of `OWNER | TENANT | FAMILY`; under `societies` and `gates` it's `SOCIETY_ADMIN | GUARD_SUPERVISOR | GUARD`. `GUARD`/`GUARD_SUPERVISOR` rows still appear in `societies` too (that hasn't changed, and `societies[].id` there is still the bare role-row id) — but every gate/device route (`/mobile/gates/:gateId/…`) should be keyed off a `gates[].gateId`, never off `societies[].societyId`. `gates` is the array that actually drives the guard app's gate switcher and every `gateId` it will ever send; treat `societies` rows with a guard role as informational (which society they guard) rather than a source of gate ids.

**`gates` is a real, backing entity now** (was: nothing — `gateId` used to be a bare string on `devices` with no row behind it, and the client had to invent a `gateId` to call any `/mobile/gates/:gateId/…` route, typically by reusing its own `societyId`, which doesn't correspond to any real device and would 404/empty). A society's admin now defines its gates explicitly (web app: Gates page), and each `GUARD`/`GUARD_SUPERVISOR` role is either:
- **restricted to one gate** — appears here as exactly one row, or
- **unrestricted** (the default, and the only mode `GUARD_SUPERVISOR` uses in practice) — expands into **one row per gate the society currently has defined**. A guard/supervisor with unrestricted access to a society that has 3 gates gets 3 rows here, one per gate, each independently selectable in the switcher. A society with zero gates defined yet contributes none — the list fills in automatically once an admin adds one.

`gates[].id` is **not** the bare society-role row id — since one role row can expand into several gate rows, `id` is `"<societyRoleId>:<gateId>"`, still stable across sessions (both halves are), still fine to persist as the chosen context by.

---

### 2.4. Refresh Access Token

**New.** Exchange a refresh token for a new access token — no password, no `/auth/login`
round trip. `login` (§2.1) and `change-password` (§2.2) both hand back a `refreshToken`
now; use this whenever a request comes back `401` instead of ending the session.

- **Endpoint**: `POST /api/v1/auth/refresh`
- **Auth Required**: No (the refresh token itself *is* the credential — don't send a
  bearer header on this call, it isn't checked)
- **Rate Limit**: 8/minute per IP — as sensitive a target as login, since a
  stolen/guessed refresh token grants a session directly

#### Request Body
```json
{
  "refreshToken": "9f8e7d6c5b4a...  (the raw token from login/change-password, not a JWT)"
}
```

#### Response (`200 OK`)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "1a2b3c4d5e6f...",
  "user": {
    "id": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
    "email": "resident@example.com",
    "name": "Arjun Mehta",
    "phone": "9876543210",
    "isSuperadmin": false,
    "mustChangePassword": false
  }
}
```

**The refresh token rotates on every use — the one just spent is dead the instant this
responds.** Always store the `refreshToken` from *this* response and discard the one you
sent; never reuse an old one, and never call `/auth/refresh` twice in parallel with the
same token (if several requests 401 at once, refresh once and retry all of them with the
one new access token — see the "why" below).

**Why rotation, and why it matters for how you retry.** Presenting an
already-rotated (i.e. already-exchanged) refresh token again isn't just rejected — it's
treated as a signal that the token was stolen and both the legitimate holder and an
attacker are now racing to use it, so **every refresh token for that account is revoked**,
forcing a real re-login on every device. This is what protects a leaked refresh token
from being useful for long, but it means naively firing a new `/auth/refresh` call from
every function that hits a `401` will lock the user out the moment two of them race. Keep
one shared in-flight refresh promise and have every caller await it, the same way this
web app's own `apiClient` does (`frontend/src/api/client.ts`).

#### Errors (all `401 Unauthorized`)
| Cause |
| :--- |
| No matching token (never issued, or the DB was reset) |
| Token already used/rotated (see reuse detection above) or explicitly logged out |
| Token past its expiry (`JWT_REFRESH_EXPIRES_IN`, default 30 days) |
| The account it belongs to is no longer `ACTIVE` |

Any of these means: clear local session state and send the user to the login screen —
there is no further recovery from a `401` here.

Plus `400 Bad Request` if `refreshToken` is missing.

---

### 2.5. Logout (Revoke Refresh Token)

Revokes one refresh token — logout on this device only, doesn't touch other sessions.

- **Endpoint**: `POST /api/v1/auth/logout`
- **Auth Required**: No

#### Request Body
```json
{ "refreshToken": "9f8e7d6c5b4a..." }
```

#### Response (`200 OK`)
```json
{ "success": true }
```
Idempotent — calling it again with the same (now-revoked) token still returns `200`,
it just has nothing left to do. Clear local access/refresh tokens regardless of whether
this call succeeds (offline logout should still log the user out locally).

---

### 2.6. Register Device Push Token (FCM)
- **Endpoint**: `POST /api/v1/mobile/me/device-token`
- **Auth Required**: Yes

#### Request Body
```json
{
  "fcmToken": "f7d98A_kJ892:APA91bF...token_payload",
  "platform": "android"
}
```
`platform`: `"android" | "ios" | "web"`. Call this again whenever the FCM token rotates (app reinstall, token refresh callback) — it's an upsert keyed on the token itself.

#### Response (`201 Created`)
```json
{
  "id": "104928e3-3982-411a-829d-091838274bb9",
  "userId": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "fcmToken": "f7d98A_kJ892:APA91bF...",
  "platform": "android",
  "createdAt": "2026-08-29T10:30:00.000Z",
  "updatedAt": "2026-08-29T10:30:00.000Z"
}
```

---

## 3. Resident Mobile App APIs (`/api/v1/mobile/units/:unitId`)

Every route below is scoped to a specific `unitId` in the path, and requires the caller to hold `OWNER`, `TENANT`, or `FAMILY` on that unit (checked both by RBAC and, independently, by the database — see §1.3).

---

### 3.1. Get Pending Visitor Approvals
Fallback/poll view of visitors currently waiting at the gate — the same data arrives in real time via the `approval.requested` WebSocket event (§5); use this for initial screen load and for recovering from a dropped socket connection.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/pending`

#### Response (`200 OK`)
```json
[
  {
    "id": "482910fa-1928-4bb9-902a-3948572bb192",
    "entryEventId": "9028471a-492a-4389-bc01-9283741829bb",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "status": "PENDING",
    "decidedByUserId": null,
    "decidedAt": null,
    "expiresAt": "2026-08-29T10:33:00.000Z",
    "createdAt": "2026-08-29T10:31:30.000Z",
    "visitorName": "Siddharth Roy",
    "visitorPhone": "+91 98223 44556",
    "subjectType": "VISITOR",
    "platform": null,
    "hasPhoto": true
  }
]
```
**Visitor detail is denormalized onto the row now** (was: the bare `approval_requests` row only — no name, phone, or way to tell a delivery from a visitor). `platform` is only non-null for a delivery (`BLINKIT`, `ZEPTO`, etc.); `subjectType` is `VISITOR | DELIVERY | STAFF`; `hasPhoto` is real too (§3.3's note on it applies here identically). This matches what the `approval.requested` socket event has always carried (§5) — the REST fallback and the realtime path are the same shape now, no client-side join needed either way.

---

### 3.2. Approve or Reject Visitor Entry
- **Endpoint**: `POST /api/v1/mobile/units/:unitId/approvals/:approvalId/decide`

#### Request Body
```json
{
  "decision": "APPROVED"
}
```
`decision`: `"APPROVED" | "REJECTED"`.

#### Response (`200 OK`)
```json
{
  "id": "482910fa-1928-4bb9-902a-3948572bb192",
  "entryEventId": "9028471a-492a-4389-bc01-9283741829bb",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "status": "APPROVED",
  "decidedByUserId": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "decidedAt": "2026-08-29T10:32:15.000Z",
  "expiresAt": "2026-08-29T10:33:00.000Z",
  "createdAt": "2026-08-29T10:31:30.000Z"
}
```
Deciding also broadcasts `approval.decided` to the gate kiosk and the unit's own other devices in real time (§5).

#### Errors
- `400 Bad Request` — `decision` missing or not one of the two allowed values.
- `409 Conflict` — `"Approval request not found for this unit, already decided, or expired"`. This fires both for the ordinary "someone else in the household already tapped Approve first" race, **and** if `approvalId` belongs to a different unit than the one in the URL — the two cases are deliberately indistinguishable in the error message so a client can't use it to probe whether an approval id exists elsewhere.

---

### 3.3. Get Unit Entry & Exit History
Paginated timeline of visitors, deliveries, staff scans, and passcode entries for this flat.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/entry-events`
- **Query Params**: `page` (default `1`), `limit` (default `20`)

#### Response (`200 OK`)
```json
{
  "items": [
    {
      "id": "9028471a-492a-4389-bc01-9283741829bb",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
      "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
      "eventSource": "GUARD_APP",
      "subjectType": "DELIVERY",
      "staffId": null,
      "visitorName": "Ramesh Delivery Partner",
      "visitorPhone": "+91 98112 33445",
      "direction": "IN",
      "occurredAt": "2026-08-29T10:20:00.000Z",
      "recordedAt": "2026-08-29T10:20:01.412Z",
      "guardUserId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
      "idempotencyKey": null,
      "rawPayload": { "platform": "BLINKIT" },
      "hasPhoto": true
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```
`eventSource`: `M50_DEVICE | GUARD_APP | PASSCODE`. `subjectType`: `STAFF | VISITOR | DELIVERY | RESIDENT`. `direction`: `IN | OUT` (a completed visit shows as two rows — an `IN` and a later `OUT`, linked via `rawPayload.originalEntryId` on the `OUT` row).

**`hasPhoto` is real now** (was: absent — the only way to find out was to call the photo endpoint below and read the `404`, which is also the status for "no such event," so the two were indistinguishable). `true` on an `IN` row means a photo was captured at that scan; always `false` on an `OUT` row (exits never capture one). Only when it's `true` is it worth calling §4.8's sibling endpoint `GET /api/v1/mobile/entry-events/:entryEventId/photo` to actually fetch it.

---

### 3.4. Get Assigned Household Staff
- **Endpoint**: `GET /api/v1/mobile/units/:unitId/staff`

#### Response (`200 OK`)
```json
[
  {
    "assignmentId": "94829105-3948-42bb-9182-49182bb19482",
    "staffId": "10492810-492a-40bb-9182-84729bb1948a",
    "name": "Sunita Devi",
    "phone": "+91 98450 11223",
    "staffType": "MAID",
    "photoData": null,
    "facePersonRef": "M50-STAFF-10492",
    "status": "ACTIVE",
    "notify": true,
    "activeFrom": "2026-01-15T09:00:00.000Z"
  }
]
```
`notify: false` means this unit chose not to receive `staff.status` push/socket notifications for this person, but the assignment is still active (M50 face-recognition matching still works at the gate either way).

---

> **Staff assignment is site-admin-only.** Residents can view who's assigned to their
> flat (§3.4) but cannot assign or unassign staff themselves — that used to be possible
> via `POST`/`DELETE /api/v1/mobile/units/:unitId/staff`, but those endpoints have been
> removed along with the `staff.assign@UNIT` grant for `OWNER`/`TENANT`. A site admin
> assigns staff to a flat from the web app instead, via
> `POST/DELETE /api/v1/web/societies/:societyId/staff/:staffId/units/:unitId`.

### 3.5. Get Society Notices
Notices/announcements posted by the society admin, org-scoped the same way every other
resource is — a resident only ever sees their own society's board.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/notices`

#### Response (`200 OK`)
```json
[
  {
    "id": "6d6f7469-6365-4f31-9182-84729bb1948a",
    "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "title": "Elevator Maintenance in Tower B",
    "body": "Scheduled preventative maintenance for Passenger Lift 2...",
    "category": "MAINTENANCE",
    "isPinned": true,
    "authorName": "Society Management",
    "authorRole": "SOCIETY_ADMIN",
    "createdAt": "2026-08-29T04:00:00.000Z",
    "updatedAt": null
  }
]
```
`category`: `GENERAL | MAINTENANCE | SECURITY | EVENT | EMERGENCY | BILLING`. Pinned notices sort first, then newest.

#### Errors
- `404 Not Found` — `unitId` doesn't resolve to a real unit.

---

### 3.6. Get Unit Complaints
Helpdesk/maintenance tickets raised from this specific flat — never another unit's, even within the same society.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/complaints`

#### Response (`200 OK`)
```json
[
  {
    "id": "636f6d70-6c61-4931-9182-84729bb1948a",
    "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "unitNumber": "A-402",
    "buildingName": "Tower A",
    "raisedByUserId": "b1948a10-492a-40bb-9182-84729bb1948a",
    "residentName": "Rajesh Sharma",
    "residentPhone": "+91 98765 43210",
    "title": "Water seepage near main bathroom wall",
    "description": "Consistent dampness observed on the common wall...",
    "category": "PLUMBING",
    "priority": "HIGH",
    "status": "OPEN",
    "adminNotes": null,
    "createdAt": "2026-08-29T05:00:00.000Z",
    "updatedAt": null,
    "resolvedAt": null
  }
]
```

---

### 3.7. Raise a Complaint
- **Endpoint**: `POST /api/v1/mobile/units/:unitId/complaints`

#### Request Body
```json
{
  "title": "Water seepage near main bathroom wall",
  "description": "Consistent dampness observed on the common wall...",
  "category": "PLUMBING",
  "priority": "HIGH"
}
```
`category` defaults to `OTHER`, `priority` defaults to `MEDIUM` if omitted. `unitId`/`societyId`/the raising user are derived server-side from the authenticated caller's own unit membership — a resident can only ever raise a ticket against their own flat.

#### Response (`201 Created`)
Same shape as §3.6's list rows, `status: "OPEN"`.

#### Errors
- `400 Bad Request` — `title` or `description` missing.
- `404 Not Found` — `unitId` doesn't resolve to a real unit.

---

### 3.8. Create Guest Passcode / QR Pass
- **Endpoint**: `POST /api/v1/mobile/units/:unitId/passcodes`

#### Request Body
```json
{
  "code": "482910",
  "validFrom": "2026-08-29T10:00:00.000Z",
  "validUntil": "2026-08-29T23:59:59.000Z",
  "maxUses": 1
}
```
- `validUntil` is **required**; `validFrom` defaults to "now" if omitted.
- `code` is optional — if omitted, the server generates a random 6-digit PIN.
- `maxUses` defaults to `1`.

#### Response (`201 Created`)
```json
{
  "id": "492810ab-492a-41bb-829d-928374bb192a",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "createdByUserId": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "code": "482910",
  "qrToken": "7f3c9a1e-2b4d-4e5f-8a6b-1c2d3e4f5a6b",
  "validFrom": "2026-08-29T10:00:00.000Z",
  "validUntil": "2026-08-29T23:59:59.000Z",
  "maxUses": 1,
  "usesCount": 0,
  "revoked": false,
  "createdAt": "2026-08-29T10:37:00.000Z"
}
```
`qrToken` is a UUID generated for every passcode regardless of the `code` field — encode it into the QR image you show the guest (or share the 6-digit `code` verbally); the gate accepts either (see §4.4).

#### Errors
- `400 Bad Request` — `validUntil` missing.

---

### 3.9. List Passcodes
- **Endpoint**: `GET /api/v1/mobile/units/:unitId/passcodes`

Returns the same shape as §3.8's response, as an array, newest first (`ORDER BY createdAt DESC`) — including expired/revoked/used-up ones, so the client is responsible for filtering what it displays as "active."

---

### 3.10. Revoke Passcode
- **Endpoint**: `DELETE /api/v1/mobile/units/:unitId/passcodes/:id`

#### Response (`200 OK`)
```json
{
  "id": "492810ab-492a-41bb-829d-928374bb192a",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "createdByUserId": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "code": "482910",
  "qrToken": "7f3c9a1e-2b4d-4e5f-8a6b-1c2d3e4f5a6b",
  "revoked": true,
  "usesCount": 0,
  "maxUses": 1,
  "validFrom": "2026-08-29T10:00:00.000Z",
  "validUntil": "2026-08-29T23:59:59.000Z",
  "createdAt": "2026-08-29T10:37:00.000Z"
}
```

#### Errors
- `404 Not Found` — `"Passcode <id> not found for this unit"` (also returned if the passcode belongs to a different unit).

---

### 3.11. Delivery Platform Automation Rules

- **Endpoints**:
  - `GET /api/v1/mobile/units/:unitId/delivery-permissions` — list all configured platform rules for this unit.
  - `PUT /api/v1/mobile/units/:unitId/delivery-permissions/:platform` — create or update the rule for one platform (upsert).
- `platform` path segment: `BLINKIT | ZEPTO | SWIGGY | INSTAMART | AMAZON | FLIPKART | OTHER`

#### Request Body (`PUT`)
```json
{
  "mode": "ALLOW_TO_DOOR",
  "windowStart": "08:00",
  "windowEnd": "22:00",
  "silent": false
}
```
- `mode` (required): `ASK_ME | LEAVE_AT_GATE | ALLOW_TO_DOOR`.
- `windowStart`/`windowEnd` (optional, `HH:MM`): auto-approval only applies inside this window; outside it (or if omitted entirely — always-on) every delivery falls back to `ASK_ME` behavior regardless of `mode`. An overnight window like `22:00`–`06:00` is supported.
- `silent` (optional, default `false`): if `true` on a `LEAVE_AT_GATE` rule, the resident still gets a push notification but with a muted/no-sound payload (`type: "DELIVERY_SILENT"` instead of `"DELIVERY_ARRIVED"` — see §5).

#### Response (`200 OK`)
```json
{
  "id": "1928472a-492a-43bb-a192-3847291bb19a",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "platform": "BLINKIT",
  "mode": "ALLOW_TO_DOOR",
  "windowStart": "08:00",
  "windowEnd": "22:00",
  "silent": false,
  "createdAt": "2026-08-29T10:40:00.000Z",
  "updatedAt": "2026-08-29T10:40:00.000Z"
}
```

#### Errors
- `400 Bad Request` — `mode` missing or invalid.

---

### 3.12. Billing & Payments (Razorpay)

Maintenance bills, ad hoc charges, and their Razorpay checkout — everything a resident
needs to see what they owe and pay it. `OWNER` and `TENANT` get both view and pay access;
`FAMILY` is view-only (see the RBAC table below) — a `FAMILY` member can see the household's
bills but the app should hide/disable "Pay Now" for them, since the backend will reject the
attempt with `403` anyway.

| Grant | `OWNER` | `TENANT` | `FAMILY` |
| :--- | :--- | :--- | :--- |
| `billing.view@UNIT` (list/view invoices) | ✅ | ✅ | ✅ |
| `billing.pay@UNIT` (create order / verify payment) | ✅ | ✅ | ❌ |

This is the same complete flow used by the resident **web** app — there is no separate
"mobile-only" or "web-only" billing API; `/api/v1/mobile/units/:unitId/billing/*` is the one
implementation both clients call.

#### 3.12.1. List My Invoices
- **Endpoint**: `GET /api/v1/mobile/units/:unitId/billing/invoices`

#### Response (`200 OK`)
```json
[
  {
    "id": "8f2a1c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "invoiceNumber": "INV-2026-09-0014",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "unitNumber": "A-402",
    "buildingName": "Tower A",
    "billingCycleId": "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
    "periodLabel": "2026-09",
    "totalAmount": 3200,
    "amountPaid": 0,
    "status": "PENDING",
    "dueDate": "2026-09-10",
    "generatedAt": "2026-09-01T00:05:00.000Z",
    "paidAt": null
  }
]
```
`status`: `PENDING | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`. Newest first
(`ORDER BY generatedAt DESC`). No pagination — a unit's invoice history is small enough
(one row per month, plus the occasional standalone `IMMEDIATE` charge invoice) that the
client is expected to fetch the full list and filter/section it client-side (as the
reference web implementation does: "Pending" vs. "History", see `BillingPage.tsx`).

#### Errors
- `404 Not Found` — `unitId` doesn't resolve to a real unit.

---

#### 3.12.2. Get Invoice Detail
Full itemized breakdown plus every payment attempt (successful or not) recorded against it.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/billing/invoices/:id`

#### Response (`200 OK`)
```json
{
  "id": "8f2a1c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "billingCycleId": "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
  "source": "MONTHLY_COMBINED",
  "invoiceNumber": "INV-2026-09-0014",
  "totalAmount": 3200,
  "amountPaid": 0,
  "status": "PENDING",
  "dueDate": "2026-09-10",
  "generatedAt": "2026-09-01T00:05:00.000Z",
  "paidAt": null,
  "lineItems": [
    { "id": "a1b2c3d4-...", "invoiceId": "8f2a1c3d-...", "description": "2BHK Standard", "category": "MAINTENANCE", "amount": 2500, "adhocChargeId": null, "billingPlanId": "d4e5f6a7-..." },
    { "id": "b2c3d4e5-...", "invoiceId": "8f2a1c3d-...", "description": "Water Tanker", "category": "UTILITY", "amount": 700, "adhocChargeId": "c3d4e5f6-...", "billingPlanId": null }
  ],
  "payments": [
    { "id": "e5f6a7b8-...", "invoiceId": "8f2a1c3d-...", "unitId": "49208a9f-...", "amount": 3200, "method": "RAZORPAY", "status": "FAILED", "razorpayOrderId": "order_ABC123", "razorpayPaymentId": null, "paidAt": null, "createdAt": "2026-09-02T11:00:00.000Z" }
  ]
}
```
- `source`: `MONTHLY_COMBINED` (the regular monthly bill) or `IMMEDIATE` (a standalone bill
  for one urgent ad hoc charge, e.g. a same-day fine — see §3.12's line-item categories).
- `category` on a line item: `MAINTENANCE | UTILITY | FINE | AMENITY | OTHER`.
- `payments` includes **every** attempt, not just the successful one — a `FAILED` row from
  an abandoned checkout is normal and expected; show only the latest/successful one
  prominently, but the full list is useful for a "payment history" or support screen.
- `payments[].method`: `RAZORPAY | MANUAL | OFFLINE` (the latter two are cash/cheque the
  admin recorded from the web console — never created by this app).
- `payments[].status`: `CREATED | SUCCESS | FAILED | REFUNDED`.

#### Errors
- `404 Not Found` — invoice doesn't exist, or it exists but belongs to a **different unit**
  than the one in the URL (deliberately indistinguishable from "doesn't exist," same
  cross-tenant-lookup convention as §3.2/§4.5 — don't infer "this bill was deleted" from a
  bare 404 here).

---

#### 3.12.3. Create a Razorpay Payment Order
Starts a payment attempt for an invoice's **current outstanding balance**
(`totalAmount - amountPaid` — so a `PARTIALLY_PAID` invoice only charges the remainder,
never the original total again). Call this immediately before opening the Razorpay
checkout UI; don't create an order ahead of time and cache it, since the outstanding
amount can change between screens (e.g. the admin recorded a manual part-payment).

- **Endpoint**: `POST /api/v1/mobile/units/:unitId/billing/invoices/:id/pay/order`
- **Idempotency-Key**: supported and recommended (§1.4) — key it to the one "Pay Now" tap.

#### Response (`200 OK`)
```json
{
  "orderId": "order_QqXyZ1234567890",
  "amount": 320000,
  "currency": "INR",
  "keyId": "rzp_test_1234567890abcd",
  "invoiceNumber": "INV-2026-09-0014"
}
```
- **`amount` is in paise** (integer, smallest currency unit) — `320000` = ₹3,200.00. Pass it
  to the Razorpay SDK exactly as returned; do not re-multiply/re-derive it from the invoice's
  `totalAmount` (which is in rupees).
- `keyId` is Razorpay's **publishable** key (`rzp_test_...` or `rzp_live_...`, safe to embed
  in client code) — pass it as the SDK's `key` option. It is *not* a secret.
- A `payments` row is inserted server-side with `status: "CREATED"` before this responds; if
  the resident abandons the checkout, that row simply stays `CREATED`/becomes `FAILED` and
  the invoice is unaffected — nothing needs cleaning up client-side.

#### Errors
- `404 Not Found` — invoice doesn't exist, or doesn't belong to this unit.
- `400 Bad Request` — `"Invoice is already paid"` / `"...cancelled"` (invoice `status` is
  already `PAID` or `CANCELLED`), or `"Nothing outstanding on this invoice"` (a
  `PARTIALLY_PAID` invoice whose remainder is already ≤ 0 — shouldn't normally happen, but
  guard for it rather than assuming "Pay Now" is always safe to show).
- `503 Service Unavailable` — `"Payment gateway not configured..."`. The society's backend
  deployment hasn't had `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` set yet. Show a
  "online payments aren't set up for this society yet, contact your admin" message — this is
  an expected, non-transient state for a newly onboarded society, not a bug to retry.
- `403 Forbidden` — caller holds `billing.view@UNIT` but not `billing.pay@UNIT` (i.e. is
  `FAMILY`, not `OWNER`/`TENANT`).

---

#### 3.12.4. Verify a Completed Payment
Call this from the Razorpay SDK's success handler, immediately after checkout completes.
This is what actually **applies** the payment to the invoice (bumps `amountPaid`, flips
`status` to `PAID`/`PARTIALLY_PAID`) — a successful Razorpay checkout on its own does
nothing to the invoice until this call (or the server-to-server webhook, §3.12.5) lands.

- **Endpoint**: `POST /api/v1/mobile/units/:unitId/billing/invoices/:id/pay/verify`
- **Idempotency-Key**: supported and recommended (§1.4).

#### Request Body
```json
{
  "razorpay_order_id": "order_QqXyZ1234567890",
  "razorpay_payment_id": "pay_AbCdEf0987654321",
  "razorpay_signature": "3f5e...b2a1"
}
```
All three fields are exactly what the Razorpay SDK's success callback hands you — pass them
through unchanged, don't rename the keys (they're snake_case on the wire deliberately, to
match Razorpay's own field names).

#### Response (`200 OK`)
Same shape as §3.12.2 (invoice detail, now with `status: "PAID"` or `"PARTIALLY_PAID"` and
`amountPaid` updated). Calling this again for an already-`SUCCESS` payment (e.g. the
resident's connection dropped right after the first call went through) is a safe no-op — it
just returns the current invoice detail again rather than double-applying the payment.

#### Errors
- `400 Bad Request` — one of the three fields is missing, or
  `"Payment signature verification failed"` (the HMAC didn't check out — treat as "this
  attempt failed," not a client bug, unless it happens consistently).
- `404 Not Found` — `"No matching payment order found for this invoice"` — `razorpay_order_id`
  doesn't match an order this endpoint created for this invoice/unit (e.g. stale/reused data).
- `403 Forbidden` — same `billing.pay@UNIT` requirement as order creation.

---

#### 3.12.5. Client SDK Integration (React Native)

The backend never talks to the Razorpay checkout UI directly — §3.12.3's response is
everything the SDK needs, and §3.12.4 is the only call the SDK's result feeds back into.
Using [`react-native-razorpay`](https://github.com/razorpay/react-native-razorpay) (the
same checkout flow the web app's `checkout.js` integration in `lib/razorpay.ts` implements,
just via a native SDK instead of an injected script):

```javascript
import RazorpayCheckout from 'react-native-razorpay';

async function payInvoice(unitId, invoice, user) {
  // 1. Ask the backend to open an order for the current outstanding balance.
  const order = await billingApi.createPaymentOrder(unitId, invoice.id);

  // 2. Open the native checkout with exactly what the backend returned.
  const options = {
    key: order.keyId,                 // publishable key, safe on-device
    amount: order.amount,             // paise, already computed server-side
    currency: order.currency,         // "INR"
    order_id: order.orderId,          // ties this checkout to the server-created order
    name: societyName,
    description: `Invoice ${order.invoiceNumber}`,
    prefill: { name: user.name, email: user.email, contact: user.phone },
    theme: { color: '#cd0447' },
  };

  try {
    const result = await RazorpayCheckout.open(options);
    // result: { razorpay_order_id, razorpay_payment_id, razorpay_signature }

    // 3. Verify with the backend — this is what actually marks the invoice paid.
    const updatedInvoice = await billingApi.verifyPayment(unitId, invoice.id, result);
    return updatedInvoice;
  } catch (err) {
    // User cancelled the checkout (err.code === 0 / "Payment Cancelled"), or Razorpay's own
    // in-modal failure. Either way, nothing was applied server-side — it's always safe to
    // let the resident tap "Pay Now" again from scratch (a fresh order, not a retry of this
    // one), since an abandoned order simply never gets verified.
    throw err;
  }
}
```

Key points for the app team:
- **Never compute the amount client-side.** Always use `order.amount` from §3.12.3 verbatim
  — it already reflects the exact outstanding balance at order-creation time, in paise.
- **Never skip §3.12.4.** A successful native checkout result is not itself proof of
  payment from the backend's point of view — only a verified signature is. Don't mark any
  local/cached invoice state as paid until `verifyPayment` returns `200`.
- **A checkout failure or cancellation needs no cleanup call.** There's no "cancel this
  order" endpoint, and none is needed — an order that's never verified just sits as a
  `CREATED`/`FAILED` `payments` row with no effect on the invoice.
- **If §3.12.4 network-fails after the SDK succeeded**, retry it with the *same* `result`
  object and an `Idempotency-Key` — don't discard the Razorpay result and start a new order,
  since the payment was already captured by Razorpay at that point.

#### 3.12.6. Server-to-Server Reconciliation (informational — not a client integration point)

The backend also exposes `POST /api/v1/webhooks/razorpay`, a Razorpay-signed
server-to-server callback that applies a payment the same way §3.12.4 does, as a safety net
for a resident closing the app before the verify call fires. **This is not called by any
client** — it exists purely so a payment still gets applied even if step 3 above never
happens. Nothing for the app team to build here; mentioned only so it's clear why an invoice
can occasionally flip to `PAID` without the app itself having called `pay/verify`.

#### 3.12.7. Push Notifications for Billing Events

Three push types (see §5.4's conventions) fire on the `billing` Android notification
channel — unlike the events in §5.4's table, these are **push-only**; there is no paired
WebSocket event, so don't wait on a socket event for these, only the FCM payload:

| `type` | Fired when | Typical client action |
| :--- | :--- | :--- |
| `BILL_GENERATED` | A new invoice is generated for the unit (monthly run, or an immediate ad hoc charge). | Refresh the invoice list; consider a badge/banner. |
| `PAYMENT_DUE` | An unpaid invoice is within the society's reminder window of its due date (default 3 days). | Surface a "bill due soon" reminder. |
| `PAYMENT_CONFIRMED` | A payment (Razorpay or admin-recorded manual/offline) was successfully applied. | Refresh the affected invoice; clear any "Pay Now" loading state if the app is foregrounded. |

All three carry `{ invoiceId }` in the push `data` payload for deep-linking straight to that
invoice's detail screen.

---

## 4. Guard Gate Kiosk APIs (`/api/v1/mobile/gates/:gateId`)

`:gateId` may be either the physical gate identifier or the M50/ZKTeco device's own id — the backend resolves either to the owning society internally. Every route requires the caller to hold `GUARD` or `GUARD_SUPERVISOR` on that society.

---

### 4.1. Gate Directory Quick-Search
- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/directory`
- **Query Params**: `query` (optional — matches unit number, building name, resident name, or phone, case-insensitive substring)

#### Response (`200 OK`)
```json
[
  {
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "unitNumber": "A-402",
    "buildingId": "1904d9e8-482a-460d-838d-1904bb9d83a1",
    "buildingName": "Tower A",
    "residents": [
      {
        "id": "94a73e6d-209f-43d9-95ec-e3fa0220914d",
        "name": "Arjun Mehta",
        "phone": "+91 98765 43210",
        "role": "OWNER"
      }
    ]
  }
]
```
Only currently-active memberships of `ACTIVE`-status users are included; a unit with no active residents still appears, with `residents: []`.

---

### 4.2. Search Society Staff at Gate
- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/staff`
- **Query Params**: `status` (`ACTIVE | INACTIVE`, default `ACTIVE`)

#### Response (`200 OK`)
```json
[
  {
    "id": "10492810-492a-40bb-9182-84729bb1948a",
    "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "name": "Sunita Devi",
    "phone": "+91 98450 11223",
    "staffType": "MAID",
    "photoData": null,
    "facePersonRef": "M50-STAFF-10492",
    "status": "ACTIVE",
    "createdAt": "2026-01-10T09:00:00.000Z"
  }
]
```

---

### 4.3. Log Visitor / Delivery / Staff Entry
Creates the entry event and, for `VISITOR`/`DELIVERY` subjects tied to a unit, either dispatches a live approval request or auto-approves per the unit's delivery rule (§3.11).

- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/entry-events`

#### Request Body
```json
{
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "visitorName": "Siddharth Roy",
  "visitorPhone": "+91 98223 44556",
  "subjectType": "VISITOR",
  "photoBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  "mimeType": "image/jpeg"
}
```
- `subjectType` (required): `STAFF | VISITOR | DELIVERY | RESIDENT`.
- `unitId` is required to trigger the approval/auto-approve flow below; omit it for `RESIDENT`/`STAFF` scans that aren't tied to a specific flat.
- `platform` (delivery platform enum, see §3.11) is required to match a delivery rule.
- `photoBase64` accepts a raw base64 string or a full `data:image/...;base64,` URI — both are handled.

The response shape **depends on what happened**, since there is no separate "decision" endpoint call for auto-approved deliveries:

#### Response — Visitor / `ASK_ME` delivery: pending approval created
```json
{
  "entryEvent": {
    "id": "9028471a-492a-4389-bc01-9283741829bb",
    "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "eventSource": "GUARD_APP",
    "subjectType": "VISITOR",
    "visitorName": "Siddharth Roy",
    "visitorPhone": "+91 98223 44556",
    "direction": "IN",
    "occurredAt": "2026-08-29T10:45:00.000Z",
    "recordedAt": "2026-08-29T10:45:00.412Z",
    "hasPhoto": true
  },
  "approvalRequest": {
    "id": "482910fa-1928-4bb9-902a-3948572bb192",
    "entryEventId": "9028471a-492a-4389-bc01-9283741829bb",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "status": "PENDING",
    "expiresAt": "2026-08-29T10:46:30.000Z"
  },
  "autoApproved": false
}
```
The approval expires 90 seconds after creation if the resident doesn't respond — the kiosk should show a countdown against `approvalRequest.expiresAt` and fall back to "no response — hold visitor at gate" UX when it elapses, or listen for `approval.decided` (§5).

#### Response — Delivery auto-approved by unit's rule
```json
{
  "entryEvent": { "...": "same shape as above, subjectType: \"DELIVERY\"" },
  "approvalRequest": {
    "id": "...",
    "status": "AUTO_APPROVED",
    "decidedAt": "2026-08-29T10:45:00.000Z"
  },
  "autoApproved": true,
  "mode": "LEAVE_AT_GATE"
}
```
`mode` is only present when `autoApproved: true`, and is either `"LEAVE_AT_GATE"` or `"ALLOW_TO_DOOR"` — matching whichever rule fired.

#### Response — `RESIDENT`/`STAFF` scan, or `unitId` omitted
```json
{
  "entryEvent": { "...": "as above" },
  "autoApproved": false
}
```
No `approvalRequest` key at all in this case — don't assume it's always present.

#### Errors
- `400 Bad Request` — `subjectType` missing.

---

### 4.4. Verify Guest Passcode / QR Token
- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/passcodes/verify`
- **Rate Limit**: 15/minute per IP

#### Request Body
```json
{
  "codeOrQrToken": "482910",
  "photoBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```
Accepts either the 6-digit `code` or the passcode's `qrToken` UUID (from a scanned QR) in the same field — the backend detects which by whether the value parses as a UUID. `photoBase64` is optional (captures a photo of the visitor at the moment of entry, same as §4.3).

**Response is always `200 OK` now — rejection is no longer a `401`.** A verdict isn't
an authentication failure, and there's no refresh token in this system: every other
client here treats a `401` as "sign out and re-authenticate," so a guest mistyping six
digits used to sign the guard out mid-shift and take the gate down for everyone behind
them in the queue. `verified: false` in a `200` body fixes that — check `verified`,
don't check status code.

#### Response (`200 OK`) — success
```json
{
  "verified": true,
  "entryEvent": {
    "id": "1029384a-492a-42bb-9182-38471928bb10",
    "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "eventSource": "PASSCODE",
    "subjectType": "VISITOR",
    "direction": "IN",
    "occurredAt": "2026-08-29T10:48:00.000Z"
  },
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10"
}
```
A successful verification increments the passcode's `usesCount` and logs an entry event — there is no separate "log entry" call needed after this.

#### Response (`200 OK`) — rejected
```json
{
  "verified": false,
  "reason": "REVOKED",
  "message": "Passcode has been revoked"
}
```
| `reason` | `message` | Cause |
| :--- | :--- | :--- |
| `NOT_FOUND` | `Invalid passcode or QR token` | No matching, non-expired code/QR in **this gate's own society** — note that a code valid in a different society will also produce this exact reason, by design (see §1.3). |
| `REVOKED` | `Passcode has been revoked` | Resident called §3.10 on it. |
| `USED_UP` | `Passcode usage limit exceeded` | `usesCount >= maxUses`. |
| `EXPIRED` | `Passcode is expired or not yet valid` | Outside the `validFrom`–`validUntil` window. |

#### Errors
- `400 Bad Request` if `codeOrQrToken` is missing.

---

### 4.5. Mark Visitor / Staff Exit
- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/entry-events/:entryEventId/exit`

#### Response (`200 OK`)
```json
{
  "id": "84920190-3948-43bb-a192-3847291bb19a",
  "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
  "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
  "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
  "eventSource": "GUARD_APP",
  "subjectType": "VISITOR",
  "direction": "OUT",
  "occurredAt": "2026-08-29T11:15:00.000Z",
  "rawPayload": { "originalEntryId": "9028471a-492a-4389-bc01-9283741829bb" },
  "hasPhoto": false
}
```
This inserts a **new** `OUT` entry event linked back to the original via `rawPayload.originalEntryId` — it does not mutate the original `IN` row. `hasPhoto` is always `false` here — exits don't capture a photo.

#### Errors
- `404 Not Found` — `entryEventId` doesn't exist, **or** belongs to a different society than this gate (intentionally reported the same way — see §1.3).

---

### 4.6. Get Gate Entry & Exit History
Deletes the guard app's old workaround entirely: an in-memory, per-device log of
what this device had seen since launch (lost on every restart, and split across
devices at the same gate). This is the real, persisted equivalent.

- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/entry-events?page=1&limit=20&open=true`

#### Response (`200 OK`)
Same row shape as §3.3 (`GET /mobile/units/:unitId/entry-events`), same `{items, total, page, limit}` envelope, newest first.
```json
{
  "items": [
    {
      "id": "84920190-3948-43bb-a192-3847291bb19a",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
      "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
      "eventSource": "GUARD_APP",
      "subjectType": "VISITOR",
      "direction": "IN",
      "occurredAt": "2026-08-29T11:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

`open=true` filters to `IN` rows with no matching `OUT` yet — the "still inside" list a guard's home screen counts. Omit it (or `open=false`/anything else) for the plain paginated history. Same `hasPhoto` field as §3.3, same caveat about when it's worth calling §4.8 for the actual image.

---

### 4.7. Get Pending Approvals for This Gate (fallback polling)
Same purpose as §3.1 but scoped to everything currently pending at this gate, across all units — useful for a kiosk to show "3 visitors waiting" without per-unit knowledge.

- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/pending`

#### Response (`200 OK`)
```json
[
  {
    "id": "482910fa-1928-4bb9-902a-3948572bb192",
    "entryEventId": "9028471a-492a-4389-bc01-9283741829bb",
    "unitId": "49208a9f-3958-450f-90e9-b541982bca10",
    "status": "PENDING",
    "decidedByUserId": null,
    "decidedAt": null,
    "expiresAt": "2026-08-29T10:46:30.000Z",
    "createdAt": "2026-08-29T10:45:00.000Z",
    "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
    "visitorName": "Siddharth Roy",
    "visitorPhone": "+91 98223 44556",
    "subjectType": "VISITOR",
    "platform": null,
    "hasPhoto": true,
    "unitNumber": "A-402",
    "buildingName": "Tower A"
  }
]
```
**Flat now — was nested `{approval, entryEvent}`.** Same shape as §3.1's array plus `unitNumber`/`buildingName`, which §3.1 doesn't need (a resident always knows their own flat). `unitNumber` is new: previously the guard's queue gave only `unitId`, and the flat number is the one thing a guard actually reads off the card, so the app fetched the whole gate directory just to look one up, once per queue refresh with anything waiting.

---

### 4.8. Stream Visitor Photo
- **Endpoint**: `GET /api/v1/mobile/entry-events/:entryEventId/photo`
- **Auth Required**: Yes

Authorization is resolved from the entry event's own tenancy rather than from the URL (there's no unit/gate/society segment to check against). Access is granted if the caller is **any** of:
- the guard who originally logged the entry,
- a member of the unit the entry belongs to,
- a guard/admin with gate- or society-level access covering where it happened, or
- a platform superadmin.

#### Response (`200 OK`)
```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 48201
[Binary JPEG byte stream]
```

#### Errors
- `404 Not Found` — no entry event with that id.
- `403 Forbidden` — `"You do not have access to this visitor photo"` — entry event exists but you don't fall into any of the categories above.
- `404 Not Found` — entry event exists but has no photo attached (visitor entries without a captured photo, or an image that failed to persist).

---

## 5. Real-Time WebSocket Events

### 5.1. Connecting

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8031', {
  auth: { token: accessToken }, // the same JWT used for REST calls — no "Bearer " prefix here
  transports: ['websocket', 'polling'],
});
```

The server **requires** a valid JWT to establish a connection at all — it accepts the token from (in order of preference) `auth.token`, an `Authorization: Bearer <token>` header, or a `?token=` query parameter, and disconnects immediately if none verify. There is no anonymous/unauthenticated socket mode.

### 5.2. Room Membership

Unlike the token, **room membership is not something the client controls** — it's computed server-side from the same RBAC grants that govern the REST API, every time a socket connects:

| Room | Who gets joined automatically |
| :--- | :--- |
| `user:<yourUserId>` | Always, for every authenticated connection. |
| `unit:<unitId>` | Automatically, for every unit you currently hold `OWNER`/`TENANT`/`FAMILY` on. |
| `society:<societyId>` | Automatically, for every society you hold `SOCIETY_ADMIN`/`GUARD_SUPERVISOR`/`GUARD` on. |
| `gate:<gateId>` | Only if the client explicitly asks (see below) **and** RBAC confirms you have gate-level access there — a request for a gate you're not entitled to is silently ignored, not an error. |

A guard app that wants gate-scoped events (`approval.decided`, `passcode.verified`, `entry.exit`) needs to declare which physical gate it's stationed at on connect:

```javascript
const socket = io('http://localhost:8031', {
  auth: { token: accessToken, gateId: 'gate-uuid-or-device-id' },
});
```

Platform superadmins are the one exception — since they typically hold no unit/society rows of their own, an explicit `unitId`/`societyId`/`gateId` passed at connect time is honored directly without an RBAC lookup.

### 5.3. Event Catalog

| Event | Room(s) | Fired when | Payload |
| :--- | :--- | :--- | :--- |
| `approval.requested` | `unit:<unitId>` | A visitor or `ASK_ME`-mode delivery arrives and needs a decision (§4.3). | `{ approvalId, entryEventId, unitId, subjectType: "VISITOR"\|"DELIVERY", visitorName, visitorPhone?, platform?, expiresAt }` |
| `approval.decided` | `gate:<gateId>` **and** `unit:<unitId>` | A resident decides (§3.2), or a delivery is auto-approved (§4.3). | `{ approvalId, entryEventId, status, unitId, visitorName?, subjectType?, decidedByUserId?, decidedAt, mode? }` — `mode` (`LEAVE_AT_GATE`\|`ALLOW_TO_DOOR`) only present for auto-approvals. |
| `entry.delivery` | `unit:<unitId>` | A delivery was auto-approved (companion event to `approval.decided`, resident-app-focused). | `{ entryEventId, mode, platform, autoApproved: true }` |
| `entry.passcode` | `unit:<unitId>` | A guest passcode/QR was verified at any gate (§4.4). | `{ entryEventId, passcodeId, occurredAt }` |
| `passcode.verified` | `gate:<gateId>` | Same event, gate-kiosk-focused (so the kiosk UI can flash "Entry Granted"). | `{ entryEventId, unitId, passcodeId }` |
| `entry.exit` | `unit:<unitId>` **and** `gate:<gateId>` | A guard marks an exit (§4.5). | `{ entryEventId, originalEntryId, visitorName?, occurredAt }` |
| `staff.status` | `unit:<unitId>` | A staff member's M50 face-recognition scan matched, for every notify-enabled unit they're assigned to. Emitted once per unit room, each carrying `unitIds: [thatUnitId]` — a client subscribed to several rooms at once now has a positive way to tell which one changed instead of refetching everything on every arrival/departure. | `{ staffId, name, type, direction: "IN"\|"OUT", occurredAt, unitIds: [unitId], gateId? }` |

### 5.4. Companion Push Notifications (FCM)

Several of the events above also fan out an FCM push (independent of whether the socket is connected) via `POST /api/v1/mobile/me/device-token`-registered tokens. The push `data` payload's `type` field lets the client route to the right screen without parsing the title/body text:

| `type` | Paired with | 
| :--- | :--- |
| `VISITOR_APPROVAL` | `approval.requested` (visitor) |
| `DELIVERY_APPROVAL` | `approval.requested` (delivery, `ASK_ME`) |
| `DELIVERY_ARRIVED` | `entry.delivery` auto-approve — always for `ALLOW_TO_DOOR`; for `LEAVE_AT_GATE` only when the rule's `silent` is `false` |
| `DELIVERY_SILENT` | `entry.delivery` auto-approve on a `LEAVE_AT_GATE` rule with `silent: true` — data-only, no sound/heads-up |
| `STAFF_MOVEMENT` | `staff.status` |

---

## 6. End-to-End User Workflows

### 6.1. Resident: first login & setup
1. Society Admin creates the resident's account (email + phone) via the web admin console. The resident's initial password is `<phone_digits>@iverto`.
2. App calls `POST /auth/login` with that temporary password → response has `mustChangePassword: true`. Store both `accessToken` and `refreshToken` (§2.4).
3. App shows the mandatory reset screen → `POST /auth/change-password` → store the **new** `accessToken` and `refreshToken` from the response (the old refresh token is revoked as part of this call — see §2.2).
4. App calls `GET /api/v1/mobile/me/contexts` to discover which unit(s)/role the resident has, and lets them pick a "home" unit if they have more than one.
5. App registers its FCM token via `POST /api/v1/mobile/me/device-token`.
6. App opens the WebSocket connection (§5.1) — it automatically joins `unit:<unitId>` for every unit just discovered in step 4.

### 6.2. Resident: approving a visitor in real time
1. Guard logs the visitor at the gate (§4.3) → backend creates a `PENDING` approval and emits `approval.requested` to `unit:<unitId>`, plus a `VISITOR_APPROVAL`/`DELIVERY_APPROVAL` push.
2. Resident app receives the socket event (or the push, if backgrounded) and shows the approval card with a 90-second countdown against `expiresAt`.
3. Resident taps Approve/Reject → `POST /api/v1/mobile/units/:unitId/approvals/:approvalId/decide`.
4. Backend broadcasts `approval.decided` to both `unit:<unitId>` (other household devices update in sync) and `gate:<gateId>` (kiosk flips to green/red).
5. **Fallback**: if the socket was disconnected when the event fired, the resident app should poll `GET /api/v1/mobile/units/:unitId/pending` on foreground/reconnect and reconcile — a decision made from a stale push is still safe, since §3.2 fails with `409` if someone else (or the 90s expiry) already resolved it first.

### 6.3. Resident: delivery automation (set-and-forget)
1. Resident opens delivery settings → `GET /api/v1/mobile/units/:unitId/delivery-permissions` to show current rules per platform.
2. For each platform they want to automate, `PUT /api/v1/mobile/units/:unitId/delivery-permissions/:platform` with `mode: "LEAVE_AT_GATE"` or `"ALLOW_TO_DOOR"` and an optional time window.
3. From then on, matching deliveries during the configured window skip the approval step entirely (§4.3's auto-approve response) — the resident just gets an `entry.delivery` event / `DELIVERY_ARRIVED` (or silent) push instead of a decision prompt. Deliveries outside the window, on `ASK_ME`, or on an unconfigured platform still go through the normal §6.2 flow.

### 6.4. Resident: household staff (view-only)
1. `GET /api/v1/mobile/units/:unitId/staff` (§3.4) shows who's currently assigned to the flat and their `notify` preference.
2. Ongoing: whenever an assigned staff member's face is recognized at any gate, every notify-enabled unit they're assigned to gets a `staff.status` socket event + `STAFF_MOVEMENT` push — no further API calls needed.
3. To add or remove a helper, the resident contacts their society's site admin — assignment itself is a site-admin-only action (`POST`/`DELETE /api/v1/web/societies/:societyId/staff/:staffId/units/:unitId`), not something the resident app can do directly.

### 6.4b. Resident: community board & helpdesk
1. `GET /api/v1/mobile/units/:unitId/notices` (§3.5) to show the society's announcement board.
2. `GET /api/v1/mobile/units/:unitId/complaints` (§3.6) to show this flat's own helpdesk tickets.
3. `POST /api/v1/mobile/units/:unitId/complaints` (§3.7) to raise a new ticket; the society admin triages and resolves it from the web app (`PATCH /api/v1/web/societies/:societyId/complaints/:complaintId`).

### 6.5. Resident: sharing a one-time guest passcode
1. `POST /api/v1/mobile/units/:unitId/passcodes` with a validity window (and optionally a custom 6-digit code) → response includes both `code` and `qrToken`.
2. Share the 6-digit code verbally/by text, or render `qrToken` as a QR code and share the image — either works at the gate.
3. Guest arrives; guard scans/enters it via §4.4. `usesCount` increments; once it hits `maxUses`, further attempts get `200 OK` with `{verified: false, reason: "USED_UP"}` — not a `401`.
4. Resident can `DELETE /api/v1/mobile/units/:unitId/passcodes/:id` at any time to invalidate it early (e.g. plans changed).

### 6.5b. Resident: paying a bill (Razorpay)
1. `GET /api/v1/mobile/units/:unitId/billing/invoices` (§3.12.1) to list bills; resident taps one that's `PENDING`/`PARTIALLY_PAID`/`OVERDUE`.
2. Resident taps "Pay Now" → `POST .../billing/invoices/:id/pay/order` (§3.12.3) for the current outstanding balance.
3. `503` here means the society hasn't configured Razorpay yet — show a contact-admin message, not a retry prompt.
4. Open the Razorpay SDK checkout with the returned `orderId`/`amount`/`currency`/`keyId` (§3.12.5).
5. On checkout success, `POST .../billing/invoices/:id/pay/verify` (§3.12.4) with the SDK's result — this is what actually marks the invoice paid.
6. Refresh the invoice (or just use §3.12.4's response directly) and show the updated `status`/`amountPaid`. A `PAYMENT_CONFIRMED` push (§3.12.7) arrives around the same time as a secondary confirmation.
7. If the resident cancels/closes the checkout modal, no cleanup call is needed — just let them retry "Pay Now" from step 2.

### 6.6. Guard: shift start
1. Guard app logs in (§2.1) exactly like the resident app — same `/auth/login` endpoint, different account with a `GUARD`/`GUARD_SUPERVISOR` society role. Store both `accessToken` and `refreshToken`.
2. `GET /api/v1/mobile/me/contexts` (§2.3) and read the `gates` array — each entry is a real, selectable `gateId`. One guard may hold several (unrestricted access expands into one row per gate the society has); the app renders a switcher when there's more than one, and persists the chosen context's `id`.
3. Open the WebSocket connection passing the chosen `gates[].gateId` in the auth payload (§5.2) to join that gate's room.
4. `GET /api/v1/mobile/gates/:gateId/pending` on load, to show any approvals already in flight from before the app started.
5. Through the rest of a twelve-hour shift: on any `401`, call `POST /auth/refresh` (§2.4) with the stored refresh token instead of ending the session — this is the fix for the guard being kicked to the login screen every 15 minutes mid-shift. One shared in-flight refresh, not one per failed request (see §2.4's note on why).

### 6.7. Guard: logging a visitor or delivery
1. `GET /api/v1/mobile/gates/:gateId/directory?query=...` to look up the destination flat by number, resident name, or phone.
2. Capture a photo (device camera) and base64-encode it.
3. `POST /api/v1/mobile/gates/:gateId/entry-events` with `subjectType`, the resolved `unitId`, visitor details, and the photo.
4. Branch on the response: `autoApproved: true` → let the visitor through immediately, no waiting; `autoApproved: false` with an `approvalRequest` → show the 90s waiting screen and listen for `approval.decided` on the gate's room (with `GET .../pending` as a reconnect fallback).

### 6.8. Guard: verifying a guest passcode/QR
1. Guard enters the 6-digit code manually, or scans the guest's QR (decoding to the `qrToken` UUID).
2. `POST /api/v1/mobile/gates/:gateId/passcodes/verify` with `codeOrQrToken` (+ optional photo). Always `200 OK` — check the body, not the status code.
3. `verified: true` → entry logged automatically, let the guest through. `verified: false` → show `message` (or branch on `reason` — expired vs. revoked vs. used up vs. simply invalid, §4.4's table) so the guard can explain to the guest. Nothing here ends the session; the guard stays logged in through a mistyped code.

### 6.9. Guard: marking an exit
1. From the directory or a recent-entries list, guard selects the person/vehicle leaving.
2. `POST /api/v1/mobile/gates/:gateId/entry-events/:entryEventId/exit`.
3. Backend logs the `OUT` event and notifies the unit (`entry.exit`) — no resident action required for a plain exit.

---

## 7. Security & Reliability Notes for Client Implementers

- **Tenant isolation is enforced twice** — once by the API (RBAC) and once more at the database (Postgres Row-Level Security), independently. A client should never assume "I got a 200 last time for a similar unit/gate id" generalizes to a different one; always drive `unitId`/`gateId` from a context the user actually has (§2.3), not from a previously-seen id.
- **`404` can mean "not yours," not just "doesn't exist"** for a handful of cross-tenant-sensitive lookups (marking an exit, fetching a photo) — don't render "this record was deleted" copy off a bare 404 without also handling "you don't have access" phrasing.
- **Approval decisions and passcode verification are inherently racy** — build the UI assuming a `409`/`401` can arrive even on a request that looked valid a second ago (another device decided first, the 90s window lapsed, the passcode hit its use limit mid-flight).
- **The WebSocket reflects RBAC at connect time only** — if a resident's role changes (e.g. removed from a unit) mid-session, their existing socket keeps its already-joined rooms until it reconnects. Reconnect (or force one) after any context-changing action if you need it to take effect immediately.
- **Rate limits are per-IP, not per-account** — a shared/NAT'd network (e.g. a busy gate's own wifi) can hit the passcode-verify limit faster than expected under heavy legitimate use; design the kiosk UX to handle an occasional `429` gracefully rather than as a hard failure.
