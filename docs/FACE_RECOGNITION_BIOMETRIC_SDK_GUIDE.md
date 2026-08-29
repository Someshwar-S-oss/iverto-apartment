# Face Recognition Biometric Device SDK Integration Guide (XML Protocol)

> **Master Architecture & Implementation Specification**  
> *Target Hardware:* M50 / F500 / Face Recognition Biometric Terminal Family  
> *Protocol Format:* XML over Raw WebSocket (`ws://` / `wss://`)  
> *Companion Reference File:* `websocket_sdk_protocol.txt`

---

## Table of Contents
1. [Overview & Prerequisites](#1-overview--prerequisites)
2. [System Architecture & Communication Flow](#2-system-architecture--communication-flow)
3. [Protocol Encoding, Formats & Data Types](#3-protocol-encoding-formats--data-types)
4. [Step-by-Step Implementation Guide](#4-step-by-step-implementation-guide)
   - [4.1 XML Codec & Envelope Parser](#41-xml-codec--envelope-parser)
   - [4.2 HTTP Server Upgrade & Transport Gateway](#42-http-server-upgrade--transport-gateway)
   - [4.3 Handshake & Session Management](#43-handshake--session-management)
   - [4.4 Event Router & Real-Time Ingestion](#44-event-router--real-time-ingestion)
   - [4.5 Offline Log Backfill Engine (Binary Search Seeking)](#45-offline-log-backfill-engine-binary-search-seeking)
5. [Known Quirks, Edge Cases & Firmware Workarounds](#5-known-quirks-edge-cases--firmware-workarounds)
6. [Exhaustive Sample XML Request / Response / Event Payloads](#6-exhaustive-sample-xml-request--response--event-payloads)

---

## 1. Overview & Prerequisites

This document serves as the **definitive standalone guide** for building or porting an integration server for biometric facial recognition terminals communicating over raw WebSockets with XML payloads.

### Prerequisites & Context
- **Transport**: Standard WebSockets (`ws://` or `wss://`), path typically configured as `/m50` or `/terminal`.
- **Payload**: Raw XML text strings framed within a root `<Message>` element.
- **Reference Document**: `websocket_sdk_protocol.txt` (the vendor specification).
- **Core Capabilities**: Real-time attendance log streaming, operator admin log monitoring, remote user provisioning, face photo/template enrolment, remote door unlock/enrolment commands, and historical log backfilling.

---

## 2. System Architecture & Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│              Biometric Hardware Terminal                │
│            (e.g., M50 Face Recognition Gate)            │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ Raw WebSocket (WSS)
                             │ Path: /m50 | Payload: XML <Message>
                             ▼
┌─────────────────────────────────────────────────────────┐
│                Reverse Proxy / Ingress                  │
│                   (Caddy / Nginx)                       │
│    (Must preserve Connection: Upgrade & X-Forwarded-For)│
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│               Application HTTP Server                   │
│   (Listens for Node.js 'upgrade' connection event)      │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
   Path == '/ws'                           │ Path == '/m50'
               ▼                           ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │     Socket.IO Gateway     │   │     M50 Terminal Server   │
 │   (JSON Edge WebSockets)  │   │  (Raw XML WebSocket WSS)  │
 └───────────────────────────┘   └─────────────┬─────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 │ Decodes XML Envelope      │
                                 │ Validates Register/Login  │
                                 │ Routes Events & Responses │
                                 └─────────────┬─────────────┘
                                               │
       ┌───────────────────────────────────────┼───────────────────────────────────────┐
       ▼                                       ▼                                       ▼
┌──────────────┐                       ┌──────────────┐                       ┌──────────────┐
│  Real-Time   │                       │   Offline    │                       │  User / Face │
│ Ingestion Queue                      │   Backfill   │                       │ Provisioning │
│(TimeLog_v2)  │                       │   Engine     │                       │ (SetUserData)│
└──────────────┘                       └──────────────┘                       └──────────────┘
```

### Protocol Lifecycle Stages
1. **TCP & WebSocket Handshake**: Device connects to `wss://<host>/m50`. Connection retried every 10 seconds if dropped.
2. **Registration Stage (`Register`)**: On fresh boot or lost configuration, terminal sends its `DeviceSerialNo` and optional `CloudId`. The server checks permissions and returns a `Token`.
3. **Authentication Stage (`Login`)**: Terminal sends its `DeviceSerialNo` and issued `Token`. Server validates credentials and marks the connection as **Authenticated**.
4. **Active Streaming Stage**:
   - Device streams `TimeLog_v2` events in real-time as users pass face verification.
   - Device streams `AdminLog_v2` events when keypad settings or enrolments are modified.
   - Device sends `KeepAlive` every 30 seconds to maintain connection and sync time.
5. **Backfill Recovery Stage**: Upon `Login`, server asynchronously triggers log recovery to fetch any scans buffered on device flash storage while offline.

---

## 3. Protocol Encoding, Formats & Data Types

| Field Category | Wire Representation | Internal Decoding Logic | Example |
|---|---|---|---|
| **Root Envelope** | `<Message><Request>...</Request></Message>` | Root element is `<Message>`. Subtag (`<Request>`, `<Event>`, `<Response>`) indicates direction. | See Section 4.1 |
| **User Name** | Base64-encoded UTF-16LE | **NOT UTF-8!** Must decode base64 into a byte buffer and read as `utf16le`. | `oBlAGwAbABvAA==` $\rightarrow$ `Hello` |
| **Device Timestamps** | `YYYY-MM-DD-THH:MM:SSZ` | Contains extra hyphen before `T`. Trailing `Z` represents local wall-clock time, not UTC. | `2026-08-28-T15:30:00Z` |
| **User Period Dates** | 32-bit Integer | Packed bitmask: `(Year - 2000) << 16 \| Month << 8 \| Day` | `1704225` $\rightarrow$ `2026-01-01` |
| **Numeric Identifiers** | Zero-padded strings | XML parser **must not** auto-coerce to numbers (`<PWD>0123</PWD>` must remain `"0123"`). | `"0123"` vs `123` |
| **Verification Photos** | Base64 JPEG String | High-density payload inside `<LogImage>` or `<PhotoData>` (up to 512 KB). | `/9j/4AAQSkZJRg...` |

---

## 4. Step-by-Step Implementation Guide

### 4.1 XML Codec & Envelope Parser (`m50-protocol.ts`)

```typescript
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { format as formatDate } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const parser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  trimValues: true,
  // CRITICAL: Prevent numeric conversion so PINs ("0123") and base64 don't corrupt
  parseTagValue: false,
  processEntities: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: true,
  suppressEmptyNode: false,
  processEntities: true,
});

export type MessageKind = 'request' | 'event' | 'response';

export interface DecodedMessage {
  kind: MessageKind;
  name: string;
  fields: Record<string, string>;
}

/**
 * Parses raw XML frame received over WebSocket.
 */
export function decodeMessage(rawXml: string): DecodedMessage {
  let parsed: any;
  try {
    parsed = parser.parse(rawXml);
  } catch (err) {
    throw new Error(`Malformed XML frame: ${(err as Error).message}`);
  }

  const message = parsed?.Message;
  if (!message || typeof message !== 'object') {
    throw new Error('XML frame missing root <Message> tag');
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(message)) {
    // Take last element if XML contains duplicates
    const scalar = Array.isArray(value) ? value[value.length - 1] : value;
    if (scalar === null || scalar === undefined || typeof scalar === 'object') {
      fields[key] = '';
    } else {
      fields[key] = String(scalar).trim();
    }
  }

  // Handle vendor typo variation: <Reuqest> vs <Request>
  const discriminators: Array<[MessageKind, string]> = [
    ['request', 'Request'],
    ['request', 'Reuqest'],
    ['event', 'Event'],
    ['response', 'Response'],
  ];

  for (const [kind, tag] of discriminators) {
    if (fields[tag]) {
      return { kind, name: fields[tag], fields };
    }
  }

  throw new Error('XML message missing <Request>, <Reuqest>, <Event>, or <Response> tag');
}

/**
 * Encodes payload object into XML string frame.
 */
export function encodeMessage(fields: Record<string, string | number | undefined>): string {
  const cleanBody: Record<string, string> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) cleanBody[key] = String(val);
  }
  return `<?xml version="1.0"?>${builder.build({ Message: cleanBody })}`;
}

/** UTF-16LE Base64 Name Decoder */
export function decodeTerminalName(base64Str: string): string {
  if (!base64Str) return '';
  return Buffer.from(base64Str, 'base64').toString('utf16le').replace(/\0+$/, '');
}

/** UTF-16LE Base64 Name Encoder */
export function encodeTerminalName(name: string): string {
  return Buffer.from(name, 'utf16le').toString('base64');
}

/** Device Non-ISO Timestamp Parser */
export function parseDeviceTime(timeStr: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})-?T(\d{1,2}):(\d{2}):(\d{2})Z?$/.exec(timeStr.trim());
  if (!match) throw new Error(`Unparseable timestamp: "${timeStr}"`);
  
  const [, y, m, d, hh, mm, ss] = match;
  const pad = (s: string) => s.padStart(2, '0');
  const naiveIso = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${mm}:${ss}`;
  return fromZonedTime(naiveIso, timeZone);
}

/** Device Non-ISO Timestamp Formatter */
export function formatDeviceTime(date: Date, timeZone: string): string {
  return formatDate(toZonedTime(date, timeZone), "yyyy-MM-dd'-T'HH:mm:ss'Z'");
}

/** Packed User Period Decoder */
export function decodeUserPeriod(packed: number): { year: number; month: number; day: number } | null {
  if (!packed || packed <= 0) return null;
  return {
    year: 2000 + (packed >> 16),
    month: (packed >> 8) & 0xff,
    day: packed & 0xff,
  };
}

/** Packed User Period Encoder */
export function encodeUserPeriod(year: number, month: number, day: number): number {
  return ((year - 2000) << 16) | (month << 8) | day;
}
```

---

### 4.2 HTTP Server Upgrade & Transport Gateway (`m50-server.ts`)

```typescript
import { createServer, IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';

const PATH = '/m50';
const MAX_FRAME_BYTES = 512 * 1024; // 512KB for Base64 photos
const UNCLAIMED_TIMEOUT_MS = 1000;

export class M50Server {
  private wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  public attach(httpServer: HttpServer) {
    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname = '';
      try {
        pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
      } catch {
        pathname = '';
      }

      if (pathname === PATH) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.onConnection(ws, req);
        });
        return;
      }

      // Safeguard against stale upgrade sockets being leaked by third-party libraries
      const rawSocket = socket as Duplex & { bytesWritten?: number };
      setTimeout(() => {
        if (!rawSocket.destroyed && rawSocket.writable && (rawSocket.bytesWritten ?? 0) === 0) {
          rawSocket.destroy();
        }
      }, UNCLAIMED_TIMEOUT_MS);
    });
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    const remoteIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
    console.log(`[Terminal] New connection from ${remoteIp}`);

    ws.on('message', (data: Buffer | string) => {
      try {
        const decoded = decodeMessage(data.toString());
        this.handleMessage(ws, decoded);
      } catch (err) {
        console.error(`[Terminal] Decode error: ${(err as Error).message}`);
      }
    });

    ws.on('close', (code) => {
      console.log(`[Terminal] Disconnected (${code})`);
    });
  }

  private handleMessage(ws: WebSocket, msg: DecodedMessage) {
    // Route to Handshake or Router
  }
}
```

---

### 4.3 Handshake & Session Management

```typescript
export class TerminalSessionManager {
  private activeSessions = new Map<string, { ws: WebSocket; token: string; serialNo: string }>();

  // 1. Process Register Request
  public handleRegister(ws: WebSocket, fields: Record<string, string>, validSerials: Set<string>) {
    const serial = fields.DeviceSerialNo;
    if (!serial || !validSerials.has(serial)) {
      // Reject unknown serial numbers
      ws.send(encodeMessage({ Response: 'Register', DeviceSerialNo: serial, Result: 'Fail' }));
      return;
    }

    const token = crypto.randomUUID();
    // Save token to persistent DB associated with this serial number...

    ws.send(encodeMessage({
      Response: 'Register',
      DeviceSerialNo: serial,
      Token: token,
      Result: 'OK',
    }));
  }

  // 2. Process Login Request
  public handleLogin(ws: WebSocket, fields: Record<string, string>, dbTokenLookup: (s: string) => string | null) {
    const serial = fields.DeviceSerialNo;
    const token = fields.Token;
    const expectedToken = dbTokenLookup(serial);

    if (!expectedToken || expectedToken !== token) {
      ws.send(encodeMessage({
        Response: 'Login',
        DeviceSerialNo: serial,
        Result: 'FailUnknownToken',
      }));
      return;
    }

    this.activeSessions.set(serial, { ws, token, serialNo: serial });
    ws.send(encodeMessage({ Response: 'Login', DeviceSerialNo: serial, Result: 'OK' }));

    // Trigger offline log backfill asynchronously
    this.triggerBackfill(serial);
  }
}
```

---

### 4.4 Event Router & Real-Time Ingestion

```typescript
export function handleEvent(ws: WebSocket, msg: DecodedMessage, deviceTimeZone: string) {
  switch (msg.name) {
    case 'KeepAlive': {
      ws.send(encodeMessage({
        Response: 'KeepAlive',
        Result: 'OK',
        DevTime: msg.fields.DevTime,
        ServerTime: formatDeviceTime(new Date(), deviceTimeZone),
      }));
      break;
    }

    case 'TimeLog_v2':
    case 'TimeLog': {
      const logId = parseInt(msg.fields.LogID, 10);
      const userId = parseInt(msg.fields.UserID, 10);
      const action = msg.fields.Action;
      const transId = msg.fields.TransID;
      const timestamp = parseDeviceTime(msg.fields.Time, deviceTimeZone);
      const photoBase64 = msg.fields.LogImage;

      // Ingest scan into DB / Event Queue...
      console.log(`[Scan] LogID: ${logId}, User: ${userId}, Action: ${action}, Time: ${timestamp.toISOString()}`);

      // Always send ACK back to device to acknowledge receipt
      ws.send(encodeMessage({
        Response: msg.name,
        TransID: transId,
        Result: 'OK',
      }));
      break;
    }

    case 'AdminLog_v2':
    case 'AdminLog': {
      const logId = parseInt(msg.fields.LogID, 10);
      const adminId = parseInt(msg.fields.AdminID, 10);
      const targetUser = parseInt(msg.fields.UserID, 10);
      const action = msg.fields.Action;
      const transId = msg.fields.TransID;

      console.log(`[Admin Activity] ${action} by Admin ${adminId} on User ${targetUser}`);

      ws.send(encodeMessage({
        Response: msg.name,
        TransID: transId,
        Result: 'OK',
      }));
      break;
    }
  }
}
```

---

### 4.5 Offline Log Backfill Engine (Binary Search Seeking)

The device maintains an internal circular ring buffer.
- `LogID` is monotonic (e.g. `1001, 1002, 1003`).
- `Position` is the 0-indexed offset into the ring buffer (`0, 1, 2, ... LogCount - 1`).

To safely backfill missing records without looping infinitely or failing:

```typescript
async function performBackfill(
  sendRequestAndWait: (reqXml: string) => Promise<Record<string, string>>,
  lastIngestedLogId: number
) {
  // 1. Get total log count on device
  const posInfo = await sendRequestAndWait(encodeMessage({ Request: 'GetGlogPosInfo' }));
  const logCount = parseInt(posInfo.LogCount || '0', 10);
  if (logCount === 0) return;

  // 2. Binary search to find ring position matching lastIngestedLogId
  let low = 0;
  let high = logCount - 1;
  let targetPos = logCount; // Default to end if all are older

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const logRes = await sendRequestAndWait(encodeMessage({ Request: 'GetNextGlog', BeginLogPos: mid }));
    const currentLogId = parseInt(logRes.LogID || '0', 10);

    if (currentLogId > lastIngestedLogId) {
      targetPos = mid;
      high = mid - 1; // Look for earlier matching log
    } else {
      low = mid + 1;
    }
  }

  // 3. Sequentially read forward from targetPos to logCount - 1
  for (let pos = targetPos; pos < logCount; pos++) {
    const logData = await sendRequestAndWait(encodeMessage({ Request: 'GetNextGlog', BeginLogPos: pos }));
    const logId = parseInt(logData.LogID, 10);

    if (logId > lastIngestedLogId) {
      // Ingest backfilled log record
      console.log(`[Backfill Ingested] LogID: ${logId}, User: ${logData.UserID}`);
    }
  }
}
```

---

## 5. Known Quirks, Edge Cases & Firmware Workarounds

| Quirk / Issue | Firmware Behavior | Root Cause | Workaround / Fix |
|---|---|---|---|
| **`GetUserData` Typo** | Device returns/expects `<Reuqest>` tag in XML. | Typo in vendor C/C++ SDK header. | Codec matches on both `Request` and `Reuqest` keys during envelope parsing. |
| **Non-ISO Timestamp** | `2026-08-28-T15:30:00Z` | Extra hyphen before `T`. Trailing `Z` ignores timezone. | Manual Regex parsing + convert wall-clock time from terminal timezone using `date-fns-tz`. |
| **Garbage User Names** | Names appear as corrupted characters when decoded as UTF-8. | Name string is Base64-encoded UTF-16LE. | Must decode Base64 into Buffer and parse with `'utf16le'` encoding. |
| **Position vs LogID Failures** | Backfill fails with `Result: Fail` when querying by `LogID`. | Ring buffer indexes by `Position` offset, not `LogID`. | Execute binary search on ring `Position` index using `GetGlogPosInfo` and `GetNextGlog`. |
| **Permanent `DutyOff`** | Scan events set `<AttendStat>DutyOff</AttendStat>` for both entries and exits. | Physical terminal menu defaulted to `DutyOff`. | Store device orientation (`in` or `out`) in server DB and override `AttendStat`. |
| **Keypad Enrolment Desync** | User enrolled at keypad creates duplicate record on server. | Keypad assigns next free integer `UserID`. | Listen to `AdminLog_v2` for `EnrollUserFP`/`EnrollUserFace` events and flag unmapped slots. |
| **Engine.IO Upgrade Reaper** | Terminal connection dropped after 1 sec with HTTP 502/404. | Socket.IO destroys unrecognized upgrade requests. | Intercept HTTP `upgrade` event before Socket.IO or disable Socket.IO's automatic upgrade reaper. |
| **Max Payload Truncation** | Connection drops when transmitting face photo. | XML payload exceeds default 128KB WS payload limit. | Set `maxPayload` on `WebSocketServer` to at least `512KB` (`512 * 1024`). |

---

## 6. Exhaustive Sample XML Request / Response / Event Payloads

### 6.1 Device Registration (`Register`)
**Device Request:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>Register</Request>
  <TerminalType>M50</TerminalType>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <CloudId>cloudid12345678</CloudId>
</Message>
```
**Server Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>Register</Response>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <Token>ee73fe2d-f765-7c13-bc8a-b584b0db5796</Token>
  <Result>OK</Result>
</Message>
```

---

### 6.2 Device Authentication (`Login`)
**Device Request:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>Login</Request>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <Token>ee73fe2d-f765-7c13-bc8a-b584b0db5796</Token>
</Message>
```
**Server Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>Login</Response>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <Result>OK</Result>
</Message>
```

---

### 6.3 Heartbeat (`KeepAlive`)
**Device Event:**
```xml
<?xml version="1.0"?>
<Message>
  <Event>KeepAlive</Event>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <DevTime>2026-08-28-T15:30:00Z</DevTime>
</Message>
```
**Server Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>KeepAlive</Response>
  <Result>OK</Result>
  <DevTime>2026-08-28-T15:30:00Z</DevTime>
  <ServerTime>2026-08-28-T15:30:00Z</ServerTime>
</Message>
```

---

### 6.4 Real-time Verification Event (`TimeLog_v2`)
**Device Event:**
```xml
<?xml version="1.0"?>
<Message>
  <Event>TimeLog_v2</Event>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <LogID>1042</LogID>
  <UserID>105</UserID>
  <Action>Face</Action>
  <AttendStat>DutyOff</AttendStat>
  <APStat>0</APStat>
  <JobCode>0</JobCode>
  <Time>2026-08-28-T15:32:10Z</Time>
  <TransID>9981</TransID>
  <LogImage>/9j/4AAQSkZJRgABAQEASABIAAD...</LogImage>
</Message>
```
**Server ACK Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>TimeLog_v2</Response>
  <TransID>9981</TransID>
  <Result>OK</Result>
</Message>
```

---

### 6.5 Admin Menu / Keypad Action (`AdminLog_v2`)
**Device Event:**
```xml
<?xml version="1.0"?>
<Message>
  <Event>AdminLog_v2</Event>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <LogID>52</LogID>
  <AdminID>1</AdminID>
  <UserID>105</UserID>
  <Action>EnrollUserFace</Action>
  <Stat>0</Stat>
  <Time>2026-08-28-T15:35:00Z</Time>
  <TransID>9982</TransID>
</Message>
```
**Server ACK Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>AdminLog_v2</Response>
  <TransID>9982</TransID>
  <Result>OK</Result>
</Message>
```

---

### 6.6 Create / Update User Profile (`SetUserData`)
**Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>SetUserData</Request>
  <UserID>105</UserID>
  <Name>oBlAGwAbABvAA==</Name>
  <Privilege>User</Privilege>
  <Depart>0</Depart>
  <Enabled>Yes</Enabled>
  <UserPeriod_Used>Yes</UserPeriod_Used>
  <UserPeriod_Start>1704225</UserPeriod_Start>
  <UserPeriod_End>1704481</UserPeriod_End>
</Message>
```
**Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>SetUserData</Response>
  <UserID>105</UserID>
  <Result>OK</Result>
</Message>
```

---

### 6.7 Fetch User Profile (`GetUserData`)
**Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>GetUserData</Request>
  <UserID>105</UserID>
</Message>
```
**Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
  <Response>GetUserData</Response>
  <UserID>105</UserID>
  <Name>oBlAGwAbABvAA==</Name>
  <Privilege>User</Privilege>
  <Depart>0</Depart>
  <Enabled>Yes</Enabled>
  <Result>OK</Result>
</Message>
```

---

### 6.8 Enrol Face by Photo Upload (`EnrollFaceByPhoto`)
**Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>EnrollFaceByPhoto</Request>
  <UserID>105</UserID>
  <PhotoData>/9j/4AAQSkZJRgABAQEASABIAAD...</PhotoData>
</Message>
```
**Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>EnrollFaceByPhoto</Response>
  <UserID>105</UserID>
  <Result>OK</Result>
</Message>
```

---

### 6.9 Trigger Physical Screen Enrolment (`RemoteEnroll`)
**Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>RemoteEnroll</Request>
  <UserID>105</UserID>
  <EnrollKind>4</EnrollKind>
</Message>
```
**Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>RemoteEnroll</Response>
  <Result>OK</Result>
</Message>
```

---

### 6.10 Backfill Log Query (`GetGlogPosInfo` & `GetNextGlog`)
**GetGlogPosInfo Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>GetGlogPosInfo</Request>
</Message>
```
**GetGlogPosInfo Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>GetGlogPosInfo</Response>
  <LogCount>150</LogCount>
  <Result>OK</Result>
</Message>
```

**GetNextGlog Server Command:**
```xml
<?xml version="1.0"?>
<Message>
  <Request>GetNextGlog</Request>
  <BeginLogPos>145</BeginLogPos>
</Message>
```
**GetNextGlog Device Response:**
```xml
<?xml version="1.0"?>
<Message>
  <Response>GetNextGlog</Response>
  <LogID>1040</LogID>
  <UserID>105</UserID>
  <Action>Face</Action>
  <AttendStat>DutyOff</AttendStat>
  <Time>2026-08-28-T15:20:00Z</Time>
  <Result>OK</Result>
</Message>
```
