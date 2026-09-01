# Backend changes the mobile apps need

**Against:** `mobile-api-documentation.md` (implementation-derived, current)
**From:** `apps/mobile` at v0.2.0 — Resident, Guard and Admin shells
**Date:** 31 August 2026, appendix on database-level RLS added 1 September 2026

The mobile client is now aligned field-for-field with the API document. This
file is the other direction: everything the apps need from the service that the
service does not do yet, in the order that would help most.

Each item says what happens today, what the client does about it, and the exact
shape that would close it. Where the app has a workaround, the workaround is a
cost — an extra round trip, a guess, or a fact held only in one device's memory
— and the point of the item is to delete it.

| # | Change | Priority | What it unblocks |
|---|---|---|---|
| 1 | `gates[]` on `/mobile/me/contexts` | **Shipped 31 Aug 2026** | The guard app, entirely |
| 2 | `GET /mobile/gates/:gateId/entry-events` | **Shipped 31 Aug 2026** | Exits after an app restart; the still-inside list |
| 3 | Visitor detail on pending approvals | **Shipped 31 Aug 2026** | One request per poll, and a correct card on a cold start |
| 4 | Passcode verification: verdict, not `401` | **Shipped 31 Aug 2026** | Removes a special case around session expiry |
| 5 | `hasPhoto` on entry events | **Shipped 31 Aug 2026** | Stops the app guessing which rows have a face |
| 6 | Deploy gate `staff`; `society-staff` intentionally removed | P2 | The guard's staff lookup; resident self-assign is gone for good, use the admin endpoint |
| 7 | Honour `Idempotency-Key` | **Shipped 31 Aug 2026** | A retried entry stops admitting two people |
| 8 | Token refresh, or a longer session | **Shipped 31 Aug 2026** | A guard signed out mid-shift |
| 9 | `unitIds[]` on `staff.status` | **Shipped 31 Aug 2026** | Cache sweeps that hit every home |
| 10 | Rate limits keyed per account, not per IP | **Shipped 31 Aug 2026** | A busy gate's shared wifi |
| 11 | `unitNumber` on gate pending rows | **Shipped 31 Aug 2026** | A directory fetch per queue refresh |
| 12 | Staff presence, assignment counts, guest names | P3 | Product surfaces removed from the app |
| 13 | Masked calling | P4 | The "no response — call the flat" button |
| 14 | `SOCIETY_ADMIN` role row for `admin@brigade.com` | **P0 — blocking, needs a DB check, not code** | The admin shell, for that account |

---

## 1. `gates[]` on `GET /mobile/me/contexts` — **shipped 31 Aug 2026, one contract deviation**

**Shipped the real thing, not a shim.** `gateId` used to be a bare uuid on
`devices` with no row behind it at all — there was no `gates` table, and no way
to assign a guard to one specific gate rather than every device in their
society (the permission layer already treated "GUARD in this society" as "GUARD
at every gate/device in this society"). Rather than invent a `gates[]` array
from that (which would've meant fabricating a `gateId`, the exact problem this
item exists to kill), gates are now a first-class entity: a `gates` table, a
nullable `society_roles.gate_id` (NULL = unrestricted, same as today; set =
scoped to that one gate), and `devices.gate_id` is a real FK into it now
(backfilled from every distinct value already in use, so nothing already
provisioned moved). Society admins manage their gates from the web app.

**One deviation from the shape proposed below, forced by the data model:**
`gates[].id` is **not** the bare society-role row id. An unrestricted
(`gate_id IS NULL`) `GUARD`/`GUARD_SUPERVISOR` row — which is the default, and
the *only* mode `GUARD_SUPERVISOR` uses — expands into **one context row per
gate the society currently has**, so a single role row can legitimately produce
several of these. `id` is `"<societyRoleId>:<gateId>"` instead: still stable
across sessions (both halves are), still fine to persist as the chosen context
by, just not equal to any single existing row's id. See
`mobile-api-documentation.md` §2.3 for the exact current shape.

```jsonc
{
  "units": [ /* unchanged */ ],
  "societies": [ /* unchanged — GUARD/GUARD_SUPERVISOR rows still appear here too */ ],
  "gates": [
    {
      "id": "829e928a-492a-43bb-a178-1928374bb901:8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
      "gateId": "8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
      "gateName": "Main Gate",
      "societyId": "593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "societyName": "Palm Grove Residences",
      "role": "GUARD"                                 // GUARD | GUARD_SUPERVISOR
    }
  ]
}
```

If the client's persisted-context lookup assumes `gates[].id` round-trips back
to a `societies[]` or any other single row id, that assumption needs to go —
treat it as an opaque, stable string and nothing more (same contract as
`units[].id`/`societies[].id` always had, just spelled out here since this is
the one place it's load-bearing).

A society with zero gates defined yet contributes no rows for its unrestricted
guards — the list fills in automatically once an admin adds one, no client
change needed when it does.

---

## 2. `GET /mobile/gates/:gateId/entry-events` — **shipped 31 Aug 2026**

**Was.** A gate could create entry events and close them, but never list them —
`lib/gateSession.ts` kept an in-memory, per-device log that reset on every
restart and split the picture across two devices at the same gate.

**Now.** Shipped exactly as proposed:

```
GET /api/v1/mobile/gates/:gateId/entry-events?page=1&limit=20&open=true
```

Same row shape as `GET /mobile/units/:unitId/entry-events`, same
`{items, total, page, limit}` envelope, newest first. `open=true` filters to
`IN` rows with no matching `OUT` yet — the still-inside list. See
`mobile-api-documentation.md` §4.6 for the full shape. `lib/gateSession.ts`
should be deletable now.

---

## 3. Visitor detail on pending approvals — **shipped 31 Aug 2026, option (a)**

**Was.** `GET /mobile/units/:unitId/pending` returned the bare
`approval_requests` row: an id, a status, a deadline, and an `entryEventId` it
said nothing further about — a card built from it could only ask a household
to admit "Visitor," with no name, no number, no way to tell a delivery from a
guest.

**Now.** Denormalized onto the row (option (a) — the smaller of the two
proposed shapes, and the one this web app's own resident UI already expected
client-side, so it was already quietly broken there in the same way):

```jsonc
{
  "id": "482910fa-…", "entryEventId": "9028471a-…", "unitId": "49208a9f-…",
  "status": "PENDING", "expiresAt": "…", "createdAt": "…",
  "visitorName": "Siddharth Roy",
  "visitorPhone": "+91 98223 44556",
  "subjectType": "VISITOR",
  "platform": null
}
```

Matches what `approval.requested` on the socket has always carried — REST
fallback and realtime path are the same shape now. `getUnitPending`'s
join-on-`entryEventId` workaround should be deletable.

**Not shipped: `hasPhoto`.** That's item 5, kept separate since it touches
more surfaces than just this one endpoint (entry-event lists too) — still
open.

---

## 4. Passcode verification should answer, not reject — **shipped 31 Aug 2026**

**Was.** `POST /mobile/gates/:gateId/passcodes/verify` returned `401` for all
four rejection cases — unknown code, revoked, uses exhausted, outside its
window — which, with no refresh token in this system, signed the guard out and
took the gate down for everyone behind them in the queue over a guest's typo.

**Now.** Always `200 OK`. Shipped the preferred shape exactly as proposed:

```jsonc
{
  "verified": false,
  "reason": "REVOKED",            // REVOKED | USED_UP | EXPIRED | NOT_FOUND
  "message": "Passcode has been revoked"
}
```

The `allow401` flag in `lib/api/http.ts` and the client-side `{valid, message}`
folding on this one call are both dead code now — the special case they existed
for is gone. Check `verified`, not status code; see
`mobile-api-documentation.md` §4.4 for the full response shape both ways.

---

## 5. `hasPhoto` on entry events — **shipped 31 Aug 2026**

**Was.** No response anywhere said whether a photo was captured — the only way
to find out was `GET /mobile/entry-events/:id/photo` and reading the `404`,
also the status for "no such event," so the two were indistinguishable. This
web app's own UI (admin gate logs, resident activity/dashboard/approvals) had
already been built expecting a `hasPhoto` field and was silently reading
`undefined` everywhere — same shape of bug as items 1, 3, and 12.

**Now.** Real boolean on every entry-event row, wherever one is returned
(`GET .../entry-events` for unit/gate/society, `POST .../entry-events` create,
`.../exit`, and both pending-approvals endpoints):

```jsonc
{ "id": "9028471a-…", "…": "…", "hasPhoto": true }
```

Known at insert time for the two write paths (`createGuardEntry`,
`verifyPasscode` — whether a photo buffer was provided in the request) so no
extra query there; the read paths (`listUnitEntryEvents`,
`listGateEntryEvents`, `listSocietyEntryEvents`, `listPendingByUnit`,
`listPendingByGate`) left-join `visitor_images` and check `IS NOT NULL`.
Always `false` on an `OUT` row — exits never capture one. Both
`expectsPhoto`-style heuristics should be deletable now; the field is never
absent, so there's no guessing left to do.

---

## 6. Deploy the two documented-but-missing routes — **revised 31 Aug 2026, item 1 reversed**

**`GET /mobile/units/:unitId/society-staff` is not coming back — this is now a policy
decision, not a deployment gap.** It only ever existed to power resident self-assignment
(`POST/DELETE /mobile/units/:unitId/staff`), and that flow has been removed on purpose:
flat owners/tenants assigning their own domestic staff turned out to be a bug, not a
feature — only the society's site admin should be able to link a helper to a flat, so the
M50 biometric roster stays admin-controlled. `staff.assign@UNIT` is gone from the
`OWNER`/`TENANT` RBAC grants; both endpoints answer `404` (route removed) rather than
"unavailable," permanently.

The add-house-help flow needs to move to the admin/web shell instead:
`POST/DELETE /api/v1/web/societies/:societyId/staff/:staffId/units/:unitId`
(society-admin auth, `staff.assign@SOCIETY`). If the resident shell wants an in-app path
for this, it's a "request assignment" flow that a site admin approves, not a direct call
— there is no resident-facing equivalent anymore.

`GET /mobile/gates/:gateId/staff` is unaffected by the above and still needed:

| Endpoint | Consequence in the app |
|---|---|
| `GET /mobile/gates/:gateId/staff` | The guard's directory has no staff section |

---

## 7. Honour `Idempotency-Key` — **shipped 31 Aug 2026**

**Was.** The app sent `Idempotency-Key` on the four writes below and the
service ignored the header — a retry after gate wifi times out could admit
the same visitor twice, log a second OUT row for one crossing, or spend a
passcode use twice on one guest.

**Now.** `IdempotencyInterceptor` (`src/common/idempotency/`), opt-in via the
header, applied to all four routes:

| Call | What it now does on a retry |
|---|---|
| `POST /mobile/gates/:id/entry-events` | Replays the original response — no second visitor logged |
| `POST …/entry-events/:id/exit` | Replays — no second OUT row |
| `POST /mobile/units/:id/approvals/:id/decide` | Replays — the client no longer sees a spurious `409` on its own retry of an already-successful decision |
| `POST /mobile/gates/:id/passcodes/verify` | Replays — no second use spent |

Stores `(userId, controller.handler, key) -> response` for 24h — Redis-backed
when `REDIS_URL` is configured (works across instances and survives
restarts, same as this exists for), same graceful in-memory fallback as
`RbacService`'s permission cache otherwise. Only a *successful* response is
cached; if the original attempt threw, a retry gets a real second attempt
rather than a replayed failure. No header on a request, no behaviour change —
this only ever replaces a duplicate execution, never blocks a distinct one.
Nothing needed on the client side — the key-generation-at-action-time
behaviour the app already has is exactly what this expects.

---

## 8. Token refresh, or a longer session — **shipped 31 Aug 2026, first option**

**Was.** `JWT_EXPIRES_IN` (15 minutes) with no refresh endpoint, so a `401`
was the end of the session and the only recovery was the login screen — a
guard signed out roughly every fifteen minutes of a twelve-hour shift, at the
barrier, with people waiting.

**Now — real refresh tokens, not a longer access-token lifetime.** Chose the
first of the three proposed options deliberately: `JWT_EXPIRES_IN` stays 15
minutes (a stolen access token's blast radius stays small), and a new
`refresh_tokens` table backs `POST /auth/refresh` and `POST /auth/logout`.
`login` and `change-password` both now return a `refreshToken` alongside
`accessToken`. Full request/response shapes: `mobile-api-documentation.md`
§2.4–2.5.

**What "real" means here, since it matters for how the client should behave:**
- **Rotation.** Every `/auth/refresh` call invalidates the token it was just
  given and returns a new one. Reuse the old one and it's rejected — same as
  any other invalid token.
- **Reuse detection.** Presenting an already-rotated token again isn't just
  rejected, it's treated as a compromise signal: *every* refresh token for
  that account is revoked, forcing a real re-login everywhere. This is the
  part that changes how a client should retry — see below.
- **Revocation on password change.** `change-password` revokes every
  refresh token issued before it and returns a fresh one for the calling
  device. Every *other* device with a stale refresh token gets signed out
  for real on its next refresh attempt, not just told its password changed.
- **Logout is real too.** `POST /auth/logout` revokes one token
  server-side — previously "logging out" only ever meant discarding the
  local access token, which kept working (in the old world, tokens didn't
  expire meaningfully) until its 15-minute natural expiry regardless.

**One behavioral requirement this puts on every client, including this repo's
own web app** (`frontend/src/api/client.ts` — already updated to match):
because reuse of a rotated token nukes every session for the account, a
client must **share one in-flight refresh promise** across all callers rather
than firing a separate `/auth/refresh` per failed request. Several requests
failing with `401` at once (a screen that fires a few calls on mount, say)
must trigger exactly one refresh, with the others awaiting that same promise
and retrying with whatever it resolves to. Firing one refresh per request
would have the first response's rotation invalidate the token the others are
about to present, defeating the fix and self-inflicting the lockout item 8
existed to prevent. The web app's `apiClient` response interceptor does this
via a shared `refreshPromise`, `_retried` flag per request to avoid infinite
loops, and a bare non-intercepted axios instance for the refresh call itself
(so a failed refresh can't recursively trigger its own 401 handling).

`http.ts`'s "one place that ends a session, one place that adopts a new
token" was exactly right for slotting this in — no further backend-driven
change should be needed there beyond wiring those two spots to
`/auth/refresh`/`/auth/logout` and applying the shared-promise pattern above.

---

## 9. `unitIds[]` on `staff.status` — **shipped 31 Aug 2026**

**Was.** The payload was `{staffId, name, type, direction, occurredAt, gateId?}`
and was emitted into each notify-enabled unit's room without ever naming the
unit — a frame naming no scope invalidated every mounted query on a busy
morning.

**Now.** `unitIds: [unitId]` on every emission (one-element array, per the
proposed shape — each emit is still per-unit-room, just self-identifying now).
The client already reads both `unitIds` and `unitId`, so no further change
needed there.

---

## 10. Rate limits keyed per account, not per IP — **shipped 31 Aug 2026**

**Was.** `POST /mobile/gates/:gateId/passcodes/verify` was 15/minute **per
IP**. A gate's own wifi is one IP with a shift's worth of guards and a kiosk
behind it, so a busy morning could exhaust the limit with entirely legitimate
use.

**Now.** The global throttler guard is `AccountThrottlerGuard` (extends
`ThrottlerGuard`, overrides `getTracker`): it decodes the caller's bearer
token (no signature check needed — a tracker key only needs to *look like* an
account to bucket by; a forged token still gets rejected downstream by the
real `JwtAuthGuard` exactly as before) and keys on `user:<sub>` when one is
present, falling back to IP otherwise. Every authenticated route — passcode
verify included — is now keyed per guard, not per gate. **Login is
unaffected and still IP-keyed**, as proposed: there's no account yet at that
point by definition, so `8/minute` per IP still applies there (a whole shift
signing in at handover can still hit it — that one's a separate, harder
problem, not solved by this change).

---

## 11. `unitNumber` on gate pending rows — **shipped 31 Aug 2026, one shape change beyond what was asked**

**Was.** `GET /mobile/gates/:gateId/pending` gave the guard `unitId` but not
the flat number — and the flat number is the one thing a guard reads off that
card. The app fetched the whole gate directory to look it up, once per queue
refresh with anything waiting.

**Now.** `unitNumber` and `buildingName` added — and the row went from nested
`{approval, entryEvent}` to flat, matching item 3's `listPendingByUnit` shape.
That wasn't asked for here specifically, but this web app's own guard kiosk
(`KioskPage.tsx`) already read `approval.unitNumber`, `approval.visitorName`,
`approval.subjectType` etc. flat off each row — the nested shape was quietly
broken there too, same pattern as items 1/3/5/12. See
`mobile-api-documentation.md` §4.7 for the full shape both endpoints now share.

---

## 12. Fields the product's story needs, and the API has no room for

Each of these was in the original design, is absent from every response, and has
been **removed from the app** rather than inferred:

| Field | Where it was | What the app shows now |
|---|---|---|
| `presence` / `lastSeenAt` on staff | Resident + admin staff lists; "staff inside" counter | Nothing. The home screen counts today's arrivals from the log instead |
| `assignmentCount` on staff | "Serves 4 homes" — the number the product is sold on | Nothing |
| `guestName` on a passcode | Every passcode row and the share sheet | Nothing. The service has no field for who a code is for |
| `decidedByName` on an approval | "Priya answered this" | "Answered 2 min ago", from `decidedAt` |
| Notices | A section in both shells | **Shipped 31 Aug 2026** — `GET /mobile/units/:unitId/notices` is real now (org-scoped, backed by a `notices` table + RLS). Bring the section back |
| Complaints | A section in both shells | **Shipped 31 Aug 2026** — `GET/POST /mobile/units/:unitId/complaints` is real now (org-scoped, backed by a `complaints` table + RLS). Bring the section back — it posts somewhere now |

None of these are urgent in the way items 1–4 are. All of them are places where
the app is quieter than the product intends.

---

## 13. Masked calling

The guard's "no response — call the flat" button opens an empty OS dialer. The
resident's real number is deliberately never on a guard's device, so this needs
the service to place the call through a masked number:

```
POST /api/v1/mobile/gates/:gateId/units/:unitId/call
→ { "maskedNumber": "+91 80 4718 2200", "expiresAt": "…" }
```

Until then the button is honest about doing nothing useful, which is the least
bad option available to the client.

---

## 14. `admin@brigade.com` resolves to no contexts — the admin shell cannot mount

**Today.** The account authenticates cleanly and then resolves to nothing:

```
POST /api/v1/auth/login         -> 200
  { "accessToken": "…",
    "user": { "id": "1e5bdda0-ba26-44d0-9f36-91d2c09afd26",
              "email": "admin@brigade.com",
              "isSuperadmin": false, "mustChangePassword": false } }

GET  /api/v1/mobile/me/contexts -> 200
  { "units": [], "societies": [] }
```

**Why that stops the app.** Roles are never read from the token — deliberately,
because a tenancy can end while a session is still alive — so
`/mobile/me/contexts` is the only thing that decides which shell mounts. The
admin tree is reachable only from a `type: "SOCIETY"` context whose role is
`SOCIETY_ADMIN` (`shellFor` in `lib/rbac.ts`), and an empty list is caught one
step earlier still, at `app/index.tsx`, which renders **"Nothing linked to this
account yet"**. Signing in therefore succeeds and opens nothing.

There is no workaround to build here. With no `societyId` there is no admin call
that can be made at all: every route the shell uses is
`/web/societies/{societyId}/…`.

**Corroboration.** The service's own permission layer agrees the account holds
no society scope:

```
GET /api/v1/web/societies/{any-id}/dashboard
  -> 403 "Missing required permission: entry.view on SOCIETY"
```

This is not item 1 in a different costume. The `societies` array is present and
implemented — it is simply empty for this user. `gates` is still absent
entirely, which remains item 1.

**Needed.** A `SOCIETY_ADMIN` role row linking user `1e5bdda0-…` to the Brigade
society, so the response carries:

```jsonc
{
  "units": [],
  "societies": [
    {
      "id": "…",              // the role row's own id — stable across sessions,
                              // the app persists the chosen context by it
      "societyId": "…",       // Brigade
      "role": "SOCIETY_ADMIN",
      "societyName": "Brigade …"
    }
  ]
}
```

Nothing to release on the app side: the admin shell mounts as soon as the row
exists.

**The open question, which decides the priority.** This was reproduced against
one account on 31 August 2026, and listing societies needs superadmin
(`isSuperadmin: false` here), so whether it generalises is unverified. Either:

  * **one bad row** — this admin was created without its role attached, and the
    fix is that row; or
  * **a provisioning gap** — nothing in the society-admin creation path ever
    writes the `SOCIETY_ADMIN` membership, in which case *every* admin account
    is in this state and the fix belongs in whatever
    `POST /web/superadmin/societies` and `POST /web/societies/{societyId}/users`
    do on creation.

A backend reader can tell which in one query. If it is the second, this sits
alongside item 1 rather than below it.

---

## Appendix — database-level tenant isolation (not a mobile ask, done anyway)

Not requested by either client and no response shape changed — noted here only
because it's real work that landed alongside everything above and touches the
same tables. Skip this section if you only care about client-visible gaps.

**What.** `buildings`, `units`, `staff`, `staff_unit_assignments`,
`entry_events`, `visitor_images`, `approval_requests`, `delivery_permissions`,
`passcodes`, `gates`, `notices`, and `complaints` all now carry a Postgres
row-level-security policy (`drizzle/0001_enable_row_level_security.sql` +
`0002`/`0003` for the two tables added alongside items 12 and 1). Every policy
is `superadminOrOwnSociety` or one join away from it
(`superadminOrParentRowVisible`, for tables scoped by `unit_id`/
`entry_event_id` rather than a direct `society_id` column) — see
`src/database/schema/rls-policies.ts`. This is a backstop behind the
application-layer RBAC checks (`RbacScopeGuard`, service-level ownership
filters), not a replacement for them: a missed `eq(societyId, …)` in
application code now fails closed at the database instead of leaking rows
cross-tenant.

**Three things had to be true simultaneously for this to actually do
anything, not just look like it does:**
- **`FORCE ROW LEVEL SECURITY` on every table.** Postgres exempts a table's
  *owner* from its own RLS policies by default — `ENABLE` alone would've been
  a no-op the moment the app connected as the owning role, which is exactly
  what it did. `drizzle-kit` has no first-class option for `FORCE`, so it's
  hand-added in the migration SQL and must stay hand-added on any future
  regeneration.
- **A separate, non-owning connection role.** Neon's provisioned roles
  (`neondb_owner` etc.) all have `BYPASSRLS` set, which makes `FORCE` moot
  too. `scripts/create-app-role.sql` (run via `scripts/run-create-app-role.js`,
  which substitutes the password placeholder first) creates `iverto_app`: a
  login role with plain `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants and no
  bypass, plus a default-privileges grant so tables added by future migrations
  pick up the same grants automatically. The app's connection pool runs as
  this role now; the owning role still runs migrations/DDL.
- **Session variables actually set, every request.** The policies key off
  `current_setting('app.current_society_id', …)` and
  `current_setting('app.is_superadmin', …)`, which only exist inside a
  transaction that set them. `DrizzleService` was restructured around this:
  `withTenantContext` opens a real transaction, runs `buildRlsSessionSql(ctx)`
  against it, and threads that transaction through `AsyncLocalStorage` so
  every `this.drizzle.db` access anywhere in the call chain — however many
  services deep — resolves to the scoped transaction without each call site
  needing to know it's inside one. `withSystemContext` is the narrow,
  explicitly-named exception for the handful of lookups that must run before
  any per-request tenant is known (resolving which tenant an opaque id
  belongs to, the RBAC authority layer itself) — it reuses the same
  `is_superadmin` bypass already granted to platform superadmins, not a
  separate escape hatch. Code that reads/writes a protected table outside
  either helper now gets zero rows back, not everything — the fail-closed
  default is silence, not a leak, but it does mean a missed
  `withTenantContext` call now reads as "empty," worth knowing if something
  that used to return data suddenly doesn't.

**Coverage.** `refresh_tokens` (item 8) deliberately has no policy — it's
user-scoped, not society-scoped, and every access already goes through
`userId`. `test/rls-live.e2e-spec.ts` exercises this against a real Postgres
connection (as `iverto_app`, not the owning role) rather than mocking
`current_setting`; `test/auth-rls.e2e-spec.ts` and `scripts/run-live-rls-test.js`
cover the login/session-variable path the same way.

---

## Appendix — what the app is currently working around

For a backend reader wanting the short version of the cost:

| Workaround | In | Deleted by |
|---|---|---|
| ~~In-memory per-device gate log~~ — real endpoint now | `lib/gateSession.ts` | #2 ✅ shipped |
| ~~Join a page of entry events onto pending approvals~~ — denormalized now | `getUnitPending` | #3 ✅ shipped |
| ~~Fetch the directory to name a flat in the guard's queue~~ — on the row now | `getGatePending` | #11 ✅ shipped |
| ~~Suppress the sign-out path on one endpoint~~ — dead code now | `allow401` in `lib/api/http.ts` | #4 ✅ shipped |
| ~~Guess which log rows have a photo~~ — real field now | `expectsPhoto` in `lib/status.ts` | #5 ✅ shipped |
| ~~"No gate assigned" screen for guards~~ — real `gates[]` now, see §1's deviation note on `id` shape | `lib/rbac.ts` | #1 ✅ shipped |
| ~~Client-generated idempotency keys nobody reads~~ — honoured now | `lib/api/http.ts` | #7 ✅ shipped |

`apps/mobile/API.md` is the app-side record of the same ground, in more detail.
