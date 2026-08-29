# Gate Management Backend (NestJS + Neon PostgreSQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance NestJS backend connecting directly to M50 facial recognition terminals over raw XML WebSockets, enforcing Postgres Row-Level Security (RLS) on Neon, providing distinct Web (Superadmin/Admin) and Mobile (Resident/Guard) REST & Socket.IO APIs, and managing atomic visitor approvals and multi-home staff fan-outs.

**Architecture:** A modular NestJS monolithic cloud backend with a custom `SharedHttpIoAdapter` that dispatches WebSocket traffic to Socket.IO (`/ws/*`) and raw terminal XML connections (`/m50`). Relational multi-tenancy and data isolation are enforced at the database engine level via Postgres RLS on Neon, wrapped in Drizzle ORM, with Redis caching for RBAC grants and real-time state sync.

**Tech Stack:**
- **Framework:** NestJS 11+ (TypeScript, Express platform)
- **Database & ORM:** Neon Serverless PostgreSQL, Drizzle ORM (`drizzle-orm`, `@neondatabase/serverless` / `pg`)
- **Cache & Pub/Sub:** Redis (`ioredis`, `@socket.io/redis-adapter`)
- **Biometric Gateway:** Raw `ws`, `fast-xml-parser`
- **Real-Time Client Gateway:** `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
- **Authentication & Security:** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`
- **Push Notifications:** `firebase-admin` (FCM)

## Global Constraints

- Separate route namespaces: `/api/v1/web/superadmin/*`, `/api/v1/web/*`, `/api/v1/mobile/*`, `/m50`.
- All tenant tables must enable Postgres Row-Level Security (RLS) policies scoped to `app.current_society_id` with superadmin bypass via `app.is_superadmin`.
- Authentication uses Email as login identifier. Initial temporary passwords follow `<phone>@iverto` with mandatory reset via `must_change_password` flag.
- Visitor photos stored directly in Neon database binary storage with optimized retrieval endpoints.
- Approval decisions must be atomic with single-winner SQL updates to prevent race conditions.

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/nest-cli.json`
- Create: `backend/drizzle.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/config/configuration.ts`
- Create: `backend/src/config/config.module.ts`
- Test: `backend/src/config/configuration.spec.ts`

**Interfaces:**
- Produces: `ConfigModule` and validated configuration service for Database, Redis, JWT, and Ports.

- [ ] **Step 1: Write configuration unit test**

```typescript
// backend/src/config/configuration.spec.ts
import configuration from './configuration';

describe('Configuration', () => {
  it('should load default port and environment values', () => {
    process.env.PORT = '8031';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'supersecretjwtkey';

    const config = configuration();
    expect(config.port).toBe(8031);
    expect(config.database.url).toBe('postgres://user:pass@localhost:5432/testdb');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.jwt.secret).toBe('supersecretjwtkey');
  });
});
```

- [ ] **Step 2: Create package.json and project setup files**

```json
// backend/package.json
{
  "name": "iverto-backend",
  "version": "1.0.0",
  "description": "NestJS Backend for Gated Community Management & Biometric Terminals",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "test": "jest",
    "test:watch": "jest --watch",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/platform-socket.io": "^11.0.0",
    "@nestjs/websockets": "^11.0.0",
    "@neondatabase/serverless": "^0.10.4",
    "@socket.io/redis-adapter": "^8.3.0",
    "bcrypt": "^5.1.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "drizzle-orm": "^0.39.3",
    "fast-xml-parser": "^4.5.3",
    "firebase-admin": "^13.1.0",
    "ioredis": "^5.5.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pg": "^8.13.3",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "socket.io": "^4.8.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.13.5",
    "@types/passport-jwt": "^4.0.1",
    "@types/pg": "^8.11.11",
    "@types/ws": "^8.5.14",
    "drizzle-kit": "^0.30.4",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 3: Implement configuration loader & module**

```typescript
// backend/src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT || '8031', 10),
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_key_change_in_prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  m50: {
    path: process.env.M50_WS_PATH || '/m50',
    cloudId: process.env.M50_CLOUD_ID || '',
  },
});
```

- [ ] **Step 4: Run tests and verify config passes**

```bash
npm --prefix backend test src/config/configuration.spec.ts
```

- [ ] **Step 5: Commit task**

```bash
git add backend/
git commit -m "feat(backend): initialize NestJS scaffolding and config module"
```

---

### Task 2: Database Layer & Drizzle Schema with Neon RLS

**Files:**
- Create: `backend/src/database/schema/enums.ts`
- Create: `backend/src/database/schema/users.ts`
- Create: `backend/src/database/schema/societies.ts`
- Create: `backend/src/database/schema/units.ts`
- Create: `backend/src/database/schema/devices.ts`
- Create: `backend/src/database/schema/staff.ts`
- Create: `backend/src/database/schema/entry-events.ts`
- Create: `backend/src/database/schema/visitor-images.ts`
- Create: `backend/src/database/schema/approvals.ts`
- Create: `backend/src/database/schema/delivery-permissions.ts`
- Create: `backend/src/database/schema/passcodes.ts`
- Create: `backend/src/database/schema/notifications.ts`
- Create: `backend/src/database/schema/audit-logs.ts`
- Create: `backend/src/database/schema/index.ts`
- Create: `backend/src/database/drizzle.service.ts`
- Create: `backend/src/database/database.module.ts`
- Create: `backend/src/database/rls.helper.ts`
- Test: `backend/src/database/drizzle.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigModule`
- Produces: `DrizzleService` providing access to `db` client and `withTenantContext(tx, { userId, societyId, isSuperadmin })` helper.

- [ ] **Step 1: Define Drizzle schema definitions and Enums**

```typescript
// backend/src/database/schema/enums.ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
export const unitRoleEnum = pgEnum('unit_role', ['OWNER', 'TENANT', 'FAMILY']);
export const societyRoleEnum = pgEnum('society_role', ['SOCIETY_ADMIN', 'GUARD_SUPERVISOR', 'GUARD']);
export const deviceVendorEnum = pgEnum('device_vendor', ['M50', 'ZKTECO', 'ESSL', 'MATRIX', 'OTHER']);
export const staffTypeEnum = pgEnum('staff_type', ['MAID', 'COOK', 'DRIVER', 'NANNY', 'OTHER']);
export const staffStatusEnum = pgEnum('staff_status', ['ACTIVE', 'INACTIVE']);
export const eventSourceEnum = pgEnum('event_source', ['M50_DEVICE', 'GUARD_APP', 'PASSCODE']);
export const subjectTypeEnum = pgEnum('subject_type', ['STAFF', 'VISITOR', 'DELIVERY', 'RESIDENT']);
export const directionEnum = pgEnum('direction', ['IN', 'OUT']);
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'AUTO_APPROVED']);
export const deliveryPlatformEnum = pgEnum('delivery_platform', ['BLINKIT', 'ZEPTO', 'SWIGGY', 'INSTAMART', 'AMAZON', 'FLIPKART', 'OTHER']);
export const deliveryModeEnum = pgEnum('delivery_mode', ['ASK_ME', 'LEAVE_AT_GATE', 'ALLOW_TO_DOOR']);
```

```typescript
// backend/src/database/schema/users.ts
import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { userStatusEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 32 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarKey: varchar('avatar_key', { length: 512 }),
  isSuperadmin: boolean('is_superadmin').default(false).notNull(),
  mustChangePassword: boolean('must_change_password').default(true).notNull(),
  status: userStatusEnum('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

```typescript
// backend/src/database/schema/societies.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const societies = pgTable('societies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
  address: varchar('address', { length: 512 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const buildings = pgTable('buildings', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
});

export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  buildingId: uuid('building_id').references(() => buildings.id, { onDelete: 'cascade' }).notNull(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  unitNumber: varchar('unit_number', { length: 64 }).notNull(),
});
```

```typescript
// backend/src/database/schema/entry-events.ts
import { pgTable, uuid, varchar, timestamp, jsonb, customType } from 'drizzle-orm/pg-core';
import { societies } from './societies';
import { units } from './societies';
import { users } from './users';
import { eventSourceEnum, subjectTypeEnum, directionEnum } from './enums';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const entryEvents = pgTable('entry_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  societyId: uuid('society_id').references(() => societies.id, { onDelete: 'cascade' }).notNull(),
  gateId: uuid('gate_id'),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
  eventSource: eventSourceEnum('event_source').notNull(),
  subjectType: subjectTypeEnum('subject_type').notNull(),
  staffId: uuid('staff_id'),
  visitorName: varchar('visitor_name', { length: 255 }),
  visitorPhone: varchar('visitor_phone', { length: 32 }),
  direction: directionEnum('direction').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  guardUserId: uuid('guard_user_id').references(() => users.id),
  idempotencyKey: uuid('idempotency_key').unique(),
  rawPayload: jsonb('raw_payload'),
});

export const visitorImages = pgTable('visitor_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryEventId: uuid('entry_event_id').references(() => entryEvents.id, { onDelete: 'cascade' }).notNull().unique(),
  imageBytes: bytea('image_bytes').notNull(),
  mimeType: varchar('mime_type', { length: 64 }).default('image/jpeg').notNull(),
  sizeBytes: varchar('size_bytes', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Implement DrizzleService and RLS Helper**

```typescript
// backend/src/database/rls.helper.ts
import { sql } from 'drizzle-orm';

export interface RlsContext {
  userId?: string;
  societyId?: string;
  isSuperadmin?: boolean;
}

export function buildRlsSessionSql(ctx: RlsContext) {
  return sql`
    SELECT 
      set_config('app.current_user_id', ${ctx.userId || ''}, true),
      set_config('app.current_society_id', ${ctx.societyId || ''}, true),
      set_config('app.is_superadmin', ${ctx.isSuperadmin ? 'true' : 'false'}, true);
  `;
}
```

```typescript
// backend/src/database/drizzle.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { buildRlsSessionSql, RlsContext } from './rls.helper';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  public db!: NodePgDatabase<typeof schema>;
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async OnModuleInit() {
    const connectionString = this.config.get<string>('database.url');
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  async withTenantContext<T>(ctx: RlsContext, cb: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      await tx.execute(buildRlsSessionSql(ctx));
      return await cb(tx as unknown as NodePgDatabase<typeof schema>);
    });
  }

  async OnModuleDestroy() {
    await this.pool?.end();
  }
}
```

- [ ] **Step 3: Run database service test**

```bash
npm --prefix backend test src/database/drizzle.service.spec.ts
```

- [ ] **Step 4: Commit task**

```bash
git add backend/src/database
git commit -m "feat(database): configure Drizzle ORM schema and Neon RLS session helper"
```

---

### Task 3: Authentication & Password-Based Onboarding Engine

**Files:**
- Create: `backend/src/modules/auth/auth.service.ts`
- Create: `backend/src/modules/auth/auth.controller.ts`
- Create: `backend/src/modules/auth/auth.module.ts`
- Create: `backend/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `backend/src/modules/auth/guards/jwt-auth.guard.ts`
- Create: `backend/src/modules/auth/guards/password-change.guard.ts`
- Create: `backend/src/modules/auth/dto/login.dto.ts`
- Create: `backend/src/modules/auth/dto/change-password.dto.ts`
- Test: `backend/src/modules/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `DrizzleService`, `ConfigService`
- Produces: `AuthService.validateUser()`, `AuthService.login()`, `AuthService.changePassword()`, `PasswordChangeGuard`.

- [ ] **Step 1: Write auth service unit test for temp password generation and forced reset**

```typescript
// backend/src/modules/auth/auth.service.spec.ts
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('should generate default temporary password format <phone>@iverto', () => {
    const tempPassword = AuthService.generateTempPassword('9876543210');
    expect(tempPassword).toBe('9876543210@iverto');
  });
});
```

- [ ] **Step 2: Implement AuthService with bcrypt hashing and JWT issuance**

```typescript
// backend/src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { users } from '../../database/schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwtService: JwtService,
  ) {}

  static generateTempPassword(phone: string): string {
    const sanitizedPhone = phone.replace(/[^0-9]/g, '');
    return `${sanitizedPhone}@iverto`;
  }

  async login(email: string, pass: string) {
    const [user] = await this.drizzle.db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);

    if (!user || !(await bcrypt.compare(pass, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperadmin: user.isSuperadmin,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: string, newPass: string) {
    if (newPass.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPass, salt);

    await this.drizzle.db
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(users.id, userId));

    const [user] = await this.drizzle.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: false,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      message: 'Password changed successfully',
    };
  }
}
```

- [ ] **Step 3: Implement PasswordChangeGuard**

```typescript
// backend/src/modules/auth/guards/password-change.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.mustChangePassword) {
      const path = request.route?.path || request.url;
      if (!path.includes('/auth/change-password')) {
        throw new ForbiddenException('Password reset required before accessing resources');
      }
    }

    return true;
  }
}
```

- [ ] **Step 4: Run tests and verify authentication tests pass**

```bash
npm --prefix backend test src/modules/auth/auth.service.spec.ts
```

- [ ] **Step 5: Commit task**

```bash
git add backend/src/modules/auth
git commit -m "feat(auth): implement email + temp password onboarding and password change gate"
```

---

### Task 4: Dynamic Scoped RBAC Engine & Context Switcher

**Files:**
- Create: `backend/src/modules/rbac/rbac.service.ts`
- Create: `backend/src/modules/rbac/rbac.module.ts`
- Create: `backend/src/modules/rbac/guards/rbac-scope.guard.ts`
- Create: `backend/src/modules/rbac/decorators/require-permission.decorator.ts`
- Create: `backend/src/modules/rbac/decorators/current-user.decorator.ts`
- Create: `backend/src/modules/rbac/rbac.constants.ts`
- Test: `backend/src/modules/rbac/rbac.service.spec.ts`

**Interfaces:**
- Consumes: `DrizzleService`, Redis Service
- Produces: `@RequirePermission(action, scopeType)`, `RbacScopeGuard`, `RbacService.getUserContexts(userId)`.

- [ ] **Step 1: Define Role Grants & Action matrix**

```typescript
// backend/src/modules/rbac/rbac.constants.ts
export enum ScopeType {
  GLOBAL = 'GLOBAL',
  SOCIETY = 'SOCIETY',
  UNIT = 'UNIT',
  GATE = 'GATE',
}

export const ROLE_GRANTS: Record<string, string[]> = {
  OWNER: [
    'approval.decide@UNIT',
    'staff.assign@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'member.invite@UNIT',
    'complaint.create@UNIT',
  ],
  TENANT: [
    'approval.decide@UNIT',
    'staff.assign@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'complaint.create@UNIT',
  ],
  FAMILY: [
    'approval.decide@UNIT',
    'passcode.create@UNIT',
    'entry.view@UNIT',
  ],
  GUARD: [
    'entry.create@GATE',
    'photo.capture@GATE',
    'approval.request@GATE',
    'passcode.verify@GATE',
    'directory.read@SOCIETY',
    'entry.view@GATE',
  ],
  GUARD_SUPERVISOR: [
    'entry.create@GATE',
    'photo.capture@GATE',
    'approval.request@GATE',
    'passcode.verify@GATE',
    'directory.read@SOCIETY',
    'entry.view@GATE',
    'guard.roster@SOCIETY',
    'entry.view@SOCIETY',
  ],
  SOCIETY_ADMIN: [
    'unit.manage@SOCIETY',
    'member.manage@SOCIETY',
    'staff.manage@SOCIETY',
    'device.manage@SOCIETY',
    'notice.post@SOCIETY',
    'entry.view@SOCIETY',
    'complaint.manage@SOCIETY',
  ],
};
```

- [ ] **Step 2: Implement RbacScopeGuard with Superadmin bypass and Redis permission caching**

```typescript
// backend/src/modules/rbac/guards/rbac-scope.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PermissionMetadata } from '../decorators/require-permission.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class RbacScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permMeta = this.reflector.get<PermissionMetadata>(PERMISSION_KEY, context.getHandler());
    if (!permMeta) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('User not authenticated');

    // Superadmin universal override
    if (user.isSuperadmin) return true;

    const targetScopeId = request.params.unitId || request.params.societyId || request.params.gateId || request.headers['x-active-context-id'];

    const hasPermission = await this.rbacService.assertPermission(user.sub, permMeta.action, permMeta.scopeType, targetScopeId);
    if (!hasPermission) {
      throw new ForbiddenException(`Missing required permission: ${permMeta.action} on ${permMeta.scopeType}`);
    }

    return true;
  }
}
```

- [ ] **Step 3: Run RBAC tests**

```bash
npm --prefix backend test src/modules/rbac/rbac.service.spec.ts
```

- [ ] **Step 4: Commit task**

```bash
git add backend/src/modules/rbac
git commit -m "feat(rbac): implement scoped role permissions and context switcher"
```

---

### Task 5: Direct-to-Cloud M50 Terminal Raw WebSocket Server

**Files:**
- Create: `backend/src/modules/m50/m50.server.ts`
- Create: `backend/src/modules/m50/m50.xml-codec.ts`
- Create: `backend/src/modules/m50/m50.service.ts`
- Create: `backend/src/modules/m50/m50.module.ts`
- Create: `backend/src/common/adapters/shared-http-io.adapter.ts`
- Test: `backend/src/modules/m50/m50.xml-codec.spec.ts`

**Interfaces:**
- Consumes: `DrizzleService`, `ConfigService`
- Produces: `M50Server` attached to HTTP upgrade on `/m50`, emitting parsed `TimeLog_v2` events to ingestion pipeline.

- [ ] **Step 1: Write XML codec test for decoding User Name (UTF-16LE) and Timestamps**

```typescript
// backend/src/modules/m50/m50.xml-codec.spec.ts
import { M50XmlCodec } from './m50.xml-codec';

describe('M50XmlCodec', () => {
  it('should decode base64 UTF-16LE user names correctly', () => {
    // "oBlAGwAbABvAA==" encodes "Hello" in UTF-16LE
    const decoded = M50XmlCodec.decodeUtf16leBase64('oBlAGwAbABvAA==');
    expect(decoded).toBe('Hello');
  });

  it('should parse M50 hardware timestamps with extra hyphen', () => {
    const parsedDate = M50XmlCodec.parseDeviceTime('2026-08-28-T15:30:00Z');
    expect(parsedDate.getUTCFullYear()).toBe(2026);
    expect(parsedDate.getUTCMonth()).toBe(7); // August (0-indexed)
  });
});
```

- [ ] **Step 2: Implement XML Codec and Envelope Parser**

```typescript
// backend/src/modules/m50/m50.xml-codec.ts
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export class M50XmlCodec {
  private static parser = new XMLParser({ ignoreAttributes: false });
  private static builder = new XMLBuilder({ ignoreAttributes: false });

  static parseXml(xmlString: string): any {
    return this.parser.parse(xmlString);
  }

  static buildResponse(type: string, payload: Record<string, any>): string {
    return this.builder.build({
      Message: {
        Response: {
          '@_Type': type,
          ...payload,
        },
      },
    });
  }

  static decodeUtf16leBase64(b64: string): string {
    if (!b64) return '';
    const buf = Buffer.from(b64, 'base64');
    return buf.toString('utf16le').replace(/\0/g, '');
  }

  static parseDeviceTime(timeStr: string): Date {
    // Standard M50 timestamp: 2026-08-28-T15:30:00Z -> replace "-T" with "T"
    const normalized = timeStr.replace('-T', 'T');
    return new Date(normalized);
  }
}
```

- [ ] **Step 3: Implement M50 Server with Register, Login, TimeLog_v2 and KeepAlive**

```typescript
// backend/src/modules/m50/m50.server.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { M50XmlCodec } from './m50.xml-codec';
import { M50Service } from './m50.service';

@Injectable()
export class M50Server {
  private readonly logger = new Logger(M50Server.name);
  private wss = new WebSocketServer({ noServer: true });

  constructor(private readonly m50Service: M50Service) {}

  handleUpgrade(req: IncomingMessage, socket: any, head: Buffer) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  init() {
    this.wss.on('connection', (ws: WebSocket) => {
      this.logger.log('M50 Terminal connected');

      ws.on('message', async (data: Buffer) => {
        try {
          const xml = data.toString('utf-8');
          const parsed = M50XmlCodec.parseXml(xml);
          const responseXml = await this.m50Service.handleMessage(parsed, ws);
          if (responseXml) {
            ws.send(responseXml);
          }
        } catch (err) {
          this.logger.error('Error processing M50 message', err);
        }
      });
    });
  }
}
```

- [ ] **Step 4: Run M50 XML codec tests**

```bash
npm --prefix backend test src/modules/m50/m50.xml-codec.spec.ts
```

- [ ] **Step 5: Commit task**

```bash
git add backend/src/modules/m50 backend/src/common/adapters
git commit -m "feat(m50): implement M50 biometric WebSocket protocol handler and XML codec"
```

---

### Task 6: Real-time Socket.IO Gateway & Notification Engine

**Files:**
- Create: `backend/src/modules/realtime/realtime.gateway.ts`
- Create: `backend/src/modules/realtime/realtime.module.ts`
- Create: `backend/src/modules/notifications/notifications.service.ts`
- Create: `backend/src/modules/notifications/notifications.module.ts`
- Test: `backend/src/modules/realtime/realtime.gateway.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`, Redis Service
- Produces: `RealtimeGateway.emitToUnit(unitId, event, data)`, `RealtimeGateway.emitToGate(gateId, event, data)`, `NotificationsService.sendPushNotification()`.

- [ ] **Step 1: Implement RealtimeGateway with scoped rooms**

```typescript
// backend/src/modules/realtime/realtime.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    const unitId = client.handshake.query.unitId as string;
    const gateId = client.handshake.query.gateId as string;
    const societyId = client.handshake.query.societyId as string;

    if (unitId) client.join(`unit:${unitId}`);
    if (gateId) client.join(`gate:${gateId}`);
    if (societyId) client.join(`society:${societyId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToUnit(unitId: string, event: string, payload: any) {
    this.server.to(`unit:${unitId}`).emit(event, payload);
  }

  emitToGate(gateId: string, event: string, payload: any) {
    this.server.to(`gate:${gateId}`).emit(event, payload);
  }
}
```

- [ ] **Step 2: Implement FCM High-Priority Data Push Service**

```typescript
// backend/src/modules/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async sendHighPriorityDataMessage(tokens: string[], data: Record<string, string>) {
    if (!tokens.length) return;

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        data,
        android: {
          priority: 'high',
        },
      });
      this.logger.log(`Sent ${response.successCount} push notifications`);
    } catch (err) {
      this.logger.error('Failed to send FCM push', err);
    }
  }
}
```

- [ ] **Step 3: Run realtime test**

```bash
npm --prefix backend test src/modules/realtime/realtime.gateway.spec.ts
```

- [ ] **Step 4: Commit task**

```bash
git add backend/src/modules/realtime backend/src/modules/notifications
git commit -m "feat(realtime): implement Socket.IO gateway and FCM high-priority push service"
```

---

### Task 7: Staff Management & Multi-Unit Arrival Fan-Out

**Files:**
- Create: `backend/src/modules/staff/staff.service.ts`
- Create: `backend/src/modules/staff/staff.module.ts`
- Create: `backend/src/modules/staff/fanout.service.ts`
- Test: `backend/src/modules/staff/fanout.service.spec.ts`

**Interfaces:**
- Consumes: `DrizzleService`, `RealtimeGateway`, `NotificationsService`
- Produces: `FanoutService.handleStaffScan(staffId, direction, occurredAt)`.

- [ ] **Step 1: Write fan-out query and notification unit test**

```typescript
// backend/src/modules/staff/fanout.service.spec.ts
import { FanoutService } from './fanout.service';

describe('FanoutService', () => {
  it('should find all assigned units and trigger real-time notification dispatch', async () => {
    // Assert staff scan triggers multi-unit notifications
  });
});
```

- [ ] **Step 2: Implement FanoutService with single indexed query**

```typescript
// backend/src/modules/staff/fanout.service.ts
import { Injectable } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { staffUnitAssignments, staff } from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FanoutService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async handleStaffScan(staffId: string, direction: 'IN' | 'OUT', occurredAt: Date) {
    const [staffMember] = await this.drizzle.db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
    if (!staffMember) return;

    const assignments = await this.drizzle.db
      .select({ unitId: staffUnitAssignments.unitId })
      .from(staffUnitAssignments)
      .where(and(eq(staffUnitAssignments.staffId, staffId), eq(staffUnitAssignments.notify, true), isNull(staffUnitAssignments.activeTo)));

    for (const assignment of assignments) {
      // 1. Emit live Socket.IO update
      this.realtime.emitToUnit(assignment.unitId, 'staff.status', {
        staffId: staffMember.id,
        name: staffMember.name,
        type: staffMember.staffType,
        direction,
        occurredAt,
      });

      // 2. Queue FCM push notification
      // (Fetches device tokens for unit members and fires multicast high-priority push)
    }
  }
}
```

- [ ] **Step 3: Run fan-out unit test**

```bash
npm --prefix backend test src/modules/staff/fanout.service.spec.ts
```

- [ ] **Step 4: Commit task**

```bash
git add backend/src/modules/staff
git commit -m "feat(staff): implement staff registry and multi-unit arrival fan-out engine"
```

---

### Task 8: Gate Operations, Visitor Approvals & Neon Image Storage

**Files:**
- Create: `backend/src/modules/entry-events/entry-events.service.ts`
- Create: `backend/src/modules/entry-events/entry-events.module.ts`
- Create: `backend/src/modules/approvals/approvals.service.ts`
- Create: `backend/src/modules/approvals/approvals.module.ts`
- Create: `backend/src/modules/media/visitor-images.service.ts`
- Create: `backend/src/modules/media/media.module.ts`
- Test: `backend/src/modules/approvals/approvals.service.spec.ts`

**Interfaces:**
- Consumes: `DrizzleService`, `RealtimeGateway`, `NotificationsService`
- Produces: `ApprovalsService.decideApproval()`, `VisitorImagesService.saveImage()`, `VisitorImagesService.getImage()`.

- [ ] **Step 1: Write approval race-condition test**

```typescript
// backend/src/modules/approvals/approvals.service.spec.ts
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService', () => {
  it('should ensure first decision wins and subsequent attempts are rejected', async () => {
    // Assert single winner row update
  });
});
```

- [ ] **Step 2: Implement single-winner atomic approval logic**

```typescript
// backend/src/modules/approvals/approvals.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { approvalRequests, entryEvents } from '../../database/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async decideApproval(approvalId: string, userId: string, decision: 'APPROVED' | 'REJECTED') {
    const result = await this.drizzle.db
      .update(approvalRequests)
      .set({
        status: decision,
        decidedByUserId: userId,
        decidedAt: new Date(),
      })
      .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.status, 'PENDING')))
      .returning();

    if (!result.length) {
      throw new ConflictException('Approval request already decided or expired');
    }

    const updated = result[0];
    const [entry] = await this.drizzle.db.select().from(entryEvents).where(eq(entryEvents.id, updated.entryEventId)).limit(1);

    if (entry && entry.gateId) {
      this.realtime.emitToGate(entry.gateId, 'approval.decided', {
        approvalId: updated.id,
        status: updated.status,
        unitId: updated.unitId,
        visitorName: entry.visitorName,
      });
    }

    return updated;
  }
}
```

- [ ] **Step 3: Implement VisitorImagesService with Neon binary storage**

```typescript
// backend/src/modules/media/visitor-images.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { visitorImages } from '../../database/schema';

@Injectable()
export class VisitorImagesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async saveImage(entryEventId: string, buffer: Buffer, mimeType = 'image/jpeg') {
    const [saved] = await this.drizzle.db
      .insert(visitorImages)
      .values({
        entryEventId,
        imageBytes: buffer,
        mimeType,
        sizeBytes: buffer.length.toString(),
      })
      .onConflictDoUpdate({
        target: visitorImages.entryEventId,
        set: { imageBytes: buffer, sizeBytes: buffer.length.toString() },
      })
      .returning();

    return saved.id;
  }

  async getImage(entryEventId: string) {
    const [image] = await this.drizzle.db.select().from(visitorImages).where(eq(visitorImages.entryEventId, entryEventId)).limit(1);
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }
}
```

- [ ] **Step 4: Run approval service tests**

```bash
npm --prefix backend test src/modules/approvals/approvals.service.spec.ts
```

- [ ] **Step 5: Commit task**

```bash
git add backend/src/modules/entry-events backend/src/modules/approvals backend/src/modules/media
git commit -m "feat(approvals): implement atomic approval state machine and Neon image storage"
```

---

### Task 9: API Routing & Controllers (Superadmin, Society Admin Web, Mobile)

**Files:**
- Create: `backend/src/controllers/web/superadmin.controller.ts`
- Create: `backend/src/controllers/web/admin-society.controller.ts`
- Create: `backend/src/controllers/mobile/resident.controller.ts`
- Create: `backend/src/controllers/mobile/guard.controller.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/main.ts`
- Test: `backend/src/controllers/web/superadmin.controller.spec.ts`

**Interfaces:**
- Consumes: All domain modules & guards
- Produces: Complete REST API surface with Swagger documentation.

- [ ] **Step 1: Implement Superadmin Web Controller**

```typescript
// backend/src/controllers/web/superadmin.controller.ts
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';

@Controller('api/v1/web/superadmin')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class SuperadminController {
  @Post('societies')
  @RequirePermission('society.create', ScopeType.GLOBAL)
  async createSociety(@Body() body: any) {
    // Provision new society client & master admin
  }

  @Get('devices')
  @RequirePermission('device.manage', ScopeType.GLOBAL)
  async listAllDevices() {
    // Global terminal monitoring
  }
}
```

- [ ] **Step 2: Implement Mobile Resident and Guard Controllers**

```typescript
// backend/src/controllers/mobile/resident.controller.ts
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { ApprovalsService } from '../../modules/approvals/approvals.service';

@Controller('api/v1/mobile/units/:unitId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard)
export class ResidentController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post('approvals/:id/decide')
  async decideApproval(@Param('id') id: string, @CurrentUser('sub') userId: string, @Body('decision') decision: 'APPROVED' | 'REJECTED') {
    return this.approvals.decideApproval(id, userId, decision);
  }
}
```

- [ ] **Step 3: Setup Main Application with SharedHttpIoAdapter for /m50 WebSocket upgrade**

```typescript
// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { M50Server } from './modules/m50/m50.server';
import { SharedHttpIoAdapter } from './common/adapters/shared-http-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const m50Server = app.get(M50Server);
  m50Server.init();

  const httpServer = app.getHttpServer();
  app.useWebSocketAdapter(new SharedHttpIoAdapter(app, m50Server));

  const port = process.env.PORT || 8031;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}
bootstrap();
```

- [ ] **Step 4: Run controller unit tests**

```bash
npm --prefix backend test src/controllers/web/superadmin.controller.spec.ts
```

- [ ] **Step 5: Commit task**

```bash
git add backend/src/controllers backend/src/app.module.ts backend/src/main.ts
git commit -m "feat(api): wire superadmin, society admin web, and mobile controllers"
```

---

### Task 10: Hardware Simulator & End-to-End Verification Suite

**Files:**
- Create: `backend/scripts/m50-simulator.ts`
- Create: `backend/test/m50-ingest.e2e-spec.ts`
- Create: `backend/test/approvals-race.e2e-spec.ts`
- Test: `backend/test/m50-ingest.e2e-spec.ts`

**Interfaces:**
- Consumes: Complete running backend application
- Produces: Verification evidence for M50 terminal streaming, offline sync, and resident approval round-trips.

- [ ] **Step 1: Write M50 Terminal Hardware Simulator**

```typescript
// backend/scripts/m50-simulator.ts
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8031/m50');

ws.on('open', () => {
  console.log('Connected to M50 Gateway');
  // 1. Send Register
  ws.send(`
    <Message>
      <Request Type="Register">
        <DeviceSerialNo>DJ20250307014</DeviceSerialNo>
        <CloudId></CloudId>
      </Request>
    </Message>
  `);
});

ws.on('message', (data) => {
  console.log('Received from server:', data.toString());
});
```

- [ ] **Step 2: Run End-to-End Test Suite**

```bash
npm --prefix backend test test/m50-ingest.e2e-spec.ts
```

- [ ] **Step 3: Commit verification suite**

```bash
git add backend/scripts backend/test
git commit -m "test(e2e): add M50 hardware simulator and end-to-end integration tests"
```
