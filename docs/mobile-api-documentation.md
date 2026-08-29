# iverto Mobile API Documentation

Complete REST and WebSocket API specification for the **iverto Mobile Apps** (Resident App & Guard Console App).

---

## 1. Global Specifications

- **Base URL**: `http://<backend-host>:8031/api/v1` (e.g. `http://localhost:8031/api/v1`)
- **Content-Type**: `application/json`
- **Authentication**: Bearer Token in standard HTTP header:
  ```http
  Authorization: Bearer <jwt_access_token>
  ```
- **Error Response Shape**:
  ```json
  {
    "statusCode": 400,
    "message": "Error description message or array of validation errors",
    "error": "Bad Request"
  }
  ```

---

## 2. Authentication & Session APIs

### 2.1. User Login
Authenticate with registered email and password.

- **Endpoint**: `POST /api/v1/auth/login`
- **Auth Required**: No

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
  "user": {
    "id": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
    "email": "resident@example.com",
    "name": "Arjun Mehta",
    "phone": "9876543210",
    "isSuperadmin": false,
    "mustChangePassword": false
  }
}
```
*(If `mustChangePassword: true`, user must be redirected to the mandatory password change endpoint before accessing other routes).*

---

### 2.2. Mandatory First-Login Password Reset
Updates temporary password generated on onboarding (`<phone>@iverto`).

- **Endpoint**: `POST /api/v1/auth/change-password`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "newPassword": "NewSecurePassword123!"
}
```

#### Response (`200 OK`)
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "Password changed successfully",
  "user": {
    "id": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
    "email": "resident@example.com",
    "name": "Arjun Mehta",
    "phone": "9876543210",
    "isSuperadmin": false,
    "mustChangePassword": false
  }
}
```

---

### 2.3. Get My Memberships & Workspaces
Retrieves all residential units, society memberships, and guard gate roles assigned to the authenticated user.

- **Endpoint**: `GET /api/v1/mobile/me/contexts`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
{
  "units": [
    {
      "id": "mem_029e843f-b883-4903-8d0f-62e92cbb3e85",
      "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
      "role": "OWNER",
      "isPrimary": true,
      "unitNumber": "A-402",
      "buildingId": "bld_1904d9e8-482a-460d-838d-1904bb9d83a1",
      "buildingName": "Tower A",
      "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "societyName": "Palm Grove Residences"
    }
  ],
  "societies": [
    {
      "id": "role_829e928a-492a-43bb-a178-1928374bb901",
      "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "role": "SOCIETY_ADMIN",
      "societyName": "Palm Grove Residences"
    }
  ]
}
```

---

### 2.4. Register Device Push Token (FCM)
Registers Firebase Cloud Messaging token for native Android / iOS visitor entry push alerts.

- **Endpoint**: `POST /api/v1/mobile/me/device-token`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "fcmToken": "f7d98A_kJ892:APA91bF...token_payload",
  "platform": "android"
}
```
*(Options for `platform`: `"android" | "ios" | "web"`)*

#### Response (`201 Created`)
```json
{
  "id": "devtok_104928e-3982-411a-829d-091838274bb9",
  "userId": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "platform": "android",
  "fcmToken": "f7d98A_kJ892:APA91bF...",
  "updatedAt": "2026-08-29T10:30:00.000Z"
}
```

---

## 3. Resident Mobile App APIs (`/api/v1/mobile/units/:unitId`)

All routes in this section are scoped to a specific `unitId`.

---

### 3.1. Get Pending Visitor Approvals
Retrieves live visitors currently waiting at the gate for approval by this unit.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/pending`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "appr_482910fa-1928-4bb9-902a-3948572bb192",
    "entryEventId": "evt_9028471a-492a-4389-bc01-9283741829bb",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "status": "PENDING",
    "validUntil": "2026-08-29T10:33:00.000Z",
    "createdAt": "2026-08-29T10:31:30.000Z",
    "visitorName": "Karan Malhotra",
    "visitorPhone": "+91 98765 00112",
    "subjectType": "VISITOR",
    "platform": null,
    "unitNumber": "A-402"
  }
]
```

---

### 3.2. Approve or Reject Visitor Entry
Submits resident decision to admit or deny the waiting visitor.

- **Endpoint**: `POST /api/v1/mobile/units/:unitId/approvals/:approvalId/decide`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "decision": "APPROVED"
}
```
*(Options: `"APPROVED" | "REJECTED"`)*

#### Response (`200 OK`)
```json
{
  "id": "appr_482910fa-1928-4bb9-902a-3948572bb192",
  "entryEventId": "evt_9028471a-492a-4389-bc01-9283741829bb",
  "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
  "status": "APPROVED",
  "decidedByUserId": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "decidedAt": "2026-08-29T10:32:15.000Z"
}
```

---

### 3.3. Get Unit Entry & Exit History
Paginated timeline of visitors, courier deliveries, and helper badge scans for this flat.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/entry-events`
- **Query Params**:
  - `page` (integer, default: 1)
  - `limit` (integer, default: 20)
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
{
  "items": [
    {
      "id": "evt_9028471a-492a-4389-bc01-9283741829bb",
      "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
      "gateId": "gate_main",
      "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
      "eventSource": "GUARD_APP",
      "subjectType": "DELIVERY",
      "platform": "BLINKIT",
      "visitorName": "Ramesh Delivery Partner",
      "visitorPhone": "+91 98112 33445",
      "staffId": null,
      "direction": "IN",
      "hasPhoto": true,
      "occurredAt": "2026-08-29T10:20:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### 3.4. Get Assigned Household Staff
Lists domestic helpers (maids, cooks, drivers) assigned to this flat.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/staff`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "assignmentId": "asgn_9482910a-3948-42bb-9182-49182bb19482",
    "staffId": "stf_1049281a-492a-40bb-9182-84729bb1948a",
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

---

### 3.5. Get Available Society Staff Roster
Retrieves verified domestic staff registered in the society that can be assigned to the flat.

- **Endpoint**: `GET /api/v1/mobile/units/:unitId/society-staff`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "stf_1049281a-492a-40bb-9182-84729bb1948a",
    "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "name": "Sunita Devi",
    "phone": "+91 98450 11223",
    "staffType": "MAID",
    "status": "ACTIVE"
  },
  {
    "id": "stf_9920192a-3948-4bb9-9182-38472bb19482",
    "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "name": "Rajesh Kumar",
    "phone": "+91 98111 22334",
    "staffType": "DRIVER",
    "status": "ACTIVE"
  }
]
```

---

### 3.6. Assign Staff to Flat
- **Endpoint**: `POST /api/v1/mobile/units/:unitId/staff`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "staffId": "stf_1049281a-492a-40bb-9182-84729bb1948a",
  "notify": true
}
```

#### Response (`201 Created`)
```json
{
  "id": "asgn_9482910a-3948-42bb-9182-49182bb19482",
  "staffId": "stf_1049281a-492a-40bb-9182-84729bb1948a",
  "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
  "notify": true,
  "activeFrom": "2026-08-29T10:35:00.000Z",
  "activeTo": null
}
```

---

### 3.7. Unassign Staff from Flat
- **Endpoint**: `DELETE /api/v1/mobile/units/:unitId/staff/:staffId`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "asgn_9482910a-3948-42bb-9182-49182bb19482",
    "staffId": "stf_1049281a-492a-40bb-9182-84729bb1948a",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "activeTo": "2026-08-29T10:36:00.000Z"
  }
]
```

---

### 3.8. Create Guest Passcode / PIN
Generates an OTP passcode or digital QR pass for visitors.

- **Endpoint**: `POST /api/v1/mobile/units/:unitId/passcodes`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "code": "482910",
  "validFrom": "2026-08-29T10:00:00.000Z",
  "validUntil": "2026-08-29T23:59:59.000Z",
  "maxUses": 1
}
```
*(If `code` is omitted, backend auto-generates a secure 6-digit PIN).*

#### Response (`201 Created`)
```json
{
  "id": "psc_492810ab-492a-41bb-829d-928374bb192a",
  "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
  "code": "482910",
  "createdByUserId": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
  "validFrom": "2026-08-29T10:00:00.000Z",
  "validUntil": "2026-08-29T23:59:59.000Z",
  "maxUses": 1,
  "usesCount": 0,
  "revoked": false,
  "createdAt": "2026-08-29T10:37:00.000Z"
}
```

---

### 3.9. List Active Passcodes
- **Endpoint**: `GET /api/v1/mobile/units/:unitId/passcodes`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "psc_492810ab-492a-41bb-829d-928374bb192a",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "code": "482910",
    "validFrom": "2026-08-29T10:00:00.000Z",
    "validUntil": "2026-08-29T23:59:59.000Z",
    "maxUses": 1,
    "usesCount": 0,
    "revoked": false,
    "createdAt": "2026-08-29T10:37:00.000Z"
  }
]
```

---

### 3.10. Revoke Passcode
- **Endpoint**: `DELETE /api/v1/mobile/units/:unitId/passcodes/:id`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "psc_492810ab-492a-41bb-829d-928374bb192a",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "revoked": true
  }
]
```

---

### 3.11. Delivery Platform Automation Permissions
- **Endpoints**:
  - `GET /api/v1/mobile/units/:unitId/delivery-permissions`
  - `PUT /api/v1/mobile/units/:unitId/delivery-permissions/:platform`
  - *(Platforms: `BLINKIT | ZEPTO | SWIGGY | INSTAMART | AMAZON | FLIPKART | OTHER`)*

#### Request Body (`PUT`)
```json
{
  "mode": "ALLOW_TO_DOOR",
  "windowStart": "08:00",
  "windowEnd": "22:00",
  "silent": false
}
```
*(Modes: `"ASK_ME" | "LEAVE_AT_GATE" | "ALLOW_TO_DOOR"`)*

#### Response (`200 OK`)
```json
{
  "id": "delperm_1928472a-492a-43bb-a192-3847291bb19a",
  "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
  "platform": "BLINKIT",
  "mode": "ALLOW_TO_DOOR",
  "windowStart": "08:00",
  "windowEnd": "22:00",
  "silent": false,
  "updatedAt": "2026-08-29T10:40:00.000Z"
}
```

---

## 4. Guard Gate Kiosk APIs (`/api/v1/mobile/gates/:gateId`)

All routes in this section are executed from security gate terminals.

---

### 4.1. Gate Directory Quick-Search
Search flats, resident names, and contact numbers at the gate.

- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/directory`
- **Query Params**: `query` (optional string search term)
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "unitNumber": "A-402",
    "buildingId": "bld_1904d9e8-482a-460d-838d-1904bb9d83a1",
    "buildingName": "Tower A",
    "residents": [
      {
        "id": "usr_94a73e6d-209f-43d9-95ec-e3fa0220914d",
        "name": "Arjun Mehta",
        "phone": "+91 98765 43210",
        "role": "OWNER"
      }
    ]
  }
]
```

---

### 4.2. Search Society Staff at Gate
- **Endpoint**: `GET /api/v1/mobile/gates/:gateId/staff`
- **Query Params**: `status` (optional, default: `"ACTIVE"`)
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
[
  {
    "id": "stf_1049281a-492a-40bb-9182-84729bb1948a",
    "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "name": "Sunita Devi",
    "phone": "+91 98450 11223",
    "staffType": "MAID",
    "facePersonRef": "M50-STAFF-10492",
    "status": "ACTIVE"
  }
]
```

---

### 4.3. Log Visitor / Courier Entry
Dispatches live approval request to the resident app or auto-approves according to pre-configured platform rules.

- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/entry-events`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
  "visitorName": "Siddharth Roy",
  "visitorPhone": "+91 98223 44556",
  "subjectType": "VISITOR",
  "platform": null,
  "photoBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  "mimeType": "image/jpeg"
}
```

#### Response (`201 Created` - Visitor Requiring Approval)
```json
{
  "entryEvent": {
    "id": "evt_9028471a-492a-4389-bc01-9283741829bb",
    "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "gateId": "gate_main",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "subjectType": "VISITOR",
    "visitorName": "Siddharth Roy",
    "visitorPhone": "+91 98223 44556",
    "direction": "IN",
    "occurredAt": "2026-08-29T10:45:00.000Z"
  },
  "approval": {
    "id": "appr_482910fa-1928-4bb9-902a-3948572bb192",
    "status": "PENDING",
    "validUntil": "2026-08-29T10:46:30.000Z"
  },
  "autoApproved": false,
  "message": "Approval request dispatched to resident"
}
```

#### Response (`201 Created` - Auto-Approved Delivery)
```json
{
  "entryEvent": {
    "id": "evt_9028471a-492a-4389-bc01-9283741829bb",
    "societyId": "soc_593a8e9d-192e-4001-9a77-94819d9b8e8f",
    "gateId": "gate_main",
    "unitId": "unit_49208a9f-3958-450f-90e9-b541982bca10",
    "subjectType": "DELIVERY",
    "platform": "BLINKIT",
    "direction": "IN"
  },
  "approval": null,
  "autoApproved": true,
  "message": "Delivery pre-approved (ALLOW_TO_DOOR)"
}
```

---

### 4.4. Verify Guest PIN / QR Token
Verifies numeric PIN or scanned QR token at gate.

- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/passcodes/verify`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "codeOrQrToken": "482910",
  "photoBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

#### Response (`200 OK` - Valid)
```json
{
  "valid": true,
  "entryEvent": {
    "id": "evt_1029384a-492a-42bb-9182-38471928bb10",
    "subjectType": "VISITOR",
    "direction": "IN",
    "occurredAt": "2026-08-29T10:48:00.000Z"
  },
  "message": "Passcode verified successfully. Entry granted."
}
```

---

### 4.5. Mark Visitor / Staff Exit
- **Endpoint**: `POST /api/v1/mobile/gates/:gateId/entry-events/:entryEventId/exit`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response (`200 OK`)
```json
{
  "id": "evt_8492019a-3948-43bb-a192-3847291bb19a",
  "direction": "OUT",
  "occurredAt": "2026-08-29T11:15:00.000Z"
}
```

---

### 4.6. Stream Visitor Photo
Serves captured visitor photo JPEG bytes.

- **Endpoint**: `GET /api/v1/mobile/entry-events/:entryEventId/photo`
- **Auth Required**: No (Direct byte stream)

#### Response (`200 OK`)
```http
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 48201
[Binary JPEG byte stream]
```

---

## 5. Real-Time WebSocket Events

WebSocket server connects at path `/socket.io/` or `/ws` with JWT auth handshake:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8031', {
  auth: { token: 'Bearer <jwt_access_token>' },
  transports: ['websocket', 'polling'],
});
```

### Room Subscriptions
- **Resident Flat Room**: `unit:<unitId>`
- **Guard Gate Room**: `gate:<gateId>`
- **Society Room**: `society:<societyId>`

### Event Types
| Event Name | Recipient Room | Description & Payload |
| :--- | :--- | :--- |
| `approval.requested` | `unit:<unitId>` | Dispatched to residents when a visitor/delivery partner arrives at the gate. Payload includes visitor thumbnail, visitor name, purpose/platform, and 90s countdown expiration timestamp. |
| `approval.decided` | `gate:<gateId>` | Dispatched to gate kiosk when resident taps **APPROVE** or **REJECT**. Triggers audio chime and flips UI to green ALLOW / red DENY. |
| `gate.event` | `unit:<unitId>`, `society:<societyId>` | Live stream of entries and exits (resident face scan, visitor check-in, courier arrival). |
| `device.heartbeat` | `society:<societyId>` | Live telemetry update from M50 / ZKTeco biometric gate hardware. |
