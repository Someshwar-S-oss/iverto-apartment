import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  buildings,
  devices,
  gates,
  societies,
  societyRoles,
  unitMemberships,
  units,
  users,
} from '../../database/schema';
import { ROLE_GRANTS, ScopeType } from './rbac.constants';

export interface UnitMembershipContext {
  id: string;
  unitId: string;
  role: string;
  isPrimary: boolean;
  unitNumber?: string;
  buildingId?: string;
  buildingName?: string;
  societyId: string;
  societyName?: string;
}

export interface SocietyRoleContext {
  id: string;
  societyId: string;
  role: string;
  societyName?: string;
}

export interface GateContext {
  // Composite, not the bare society_roles row id: a society-wide guard/supervisor row
  // (gateId NULL) expands into one context per gate the society has, so a single role
  // row can produce several context entries — each still needs its own stable,
  // unique id. `${societyRoleId}:${gateId}` satisfies both: stable across sessions
  // (both halves are stable), and unique per (role row, gate) pair.
  id: string;
  gateId: string;
  gateName?: string;
  societyId: string;
  societyName?: string;
  role: string;
}

export interface UserContextsResponse {
  units: UnitMembershipContext[];
  societies: SocietyRoleContext[];
  gates: GateContext[];
}

export interface CachedPermissions {
  isSuperadmin: boolean;
  unitGrants: Array<{
    unitId: string;
    societyId: string;
    role: string;
    grants: string[];
  }>;
  societyGrants: Array<{
    societyId: string;
    role: string;
    grants: string[];
    // NULL = unrestricted within the society (every gate/device); set = restricted to
    // that one gate. See rbac.constants.ts's comment on society_roles.gateId.
    gateId: string | null;
  }>;
}

@Injectable()
export class RbacService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RbacService.name);
  private redisClient: Redis | null = null;
  private readonly memoryCache = new Map<string, { data: CachedPermissions; expiresAt: number }>();
  private readonly CACHE_TTL_SECONDS = 300;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const redisUrl = this.config.get<string>('redis.url') || process.env.REDIS_URL;
      const keyPrefix = this.config.get<string>('redis.keyPrefix') || process.env.REDIS_KEY_PREFIX || 'iverto:gate:';
      if (redisUrl) {
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          keyPrefix,
          retryStrategy: () => null,
        });

        this.redisClient.on('error', (err) => {
          this.logger.debug(`Redis connection error (fallback to in-memory cache): ${err.message}`);
        });

        await this.redisClient.connect().catch((err) => {
          this.logger.debug(`Redis connect failed (fallback to in-memory cache): ${err.message}`);
        });
      }
    } catch (err: any) {
      this.logger.debug(`Redis initialization skipped: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        this.redisClient.disconnect(false);
      } catch {
        // ignore cleanup error
      }
      this.redisClient = null;
    }
    this.memoryCache.clear();
  }

  /**
   * Retrieves all active unit memberships and society roles for a user.
   */
  async getUserContexts(userId: string): Promise<UserContextsResponse> {
    const now = new Date();

    // units/buildings are RLS-protected (see ./schema), but this join is the RBAC
    // authority layer computing WHAT a user has access to in the first place — it can't
    // be scoped to a society it doesn't know yet, so it runs with the same is_superadmin
    // bypass the policies already grant to platform superadmins. See rls.helper.ts.
    const unitRows = await this.drizzle.withSystemContext((tx) =>
      tx
        .select({
          id: unitMemberships.id,
          unitId: unitMemberships.unitId,
          role: unitMemberships.role,
          isPrimary: unitMemberships.isPrimary,
          unitNumber: units.unitNumber,
          buildingId: units.buildingId,
          buildingName: buildings.name,
          societyId: units.societyId,
          societyName: societies.name,
        })
        .from(unitMemberships)
        .innerJoin(units, eq(unitMemberships.unitId, units.id))
        .leftJoin(buildings, eq(units.buildingId, buildings.id))
        .leftJoin(societies, eq(units.societyId, societies.id))
        .where(
          and(
            eq(unitMemberships.userId, userId),
            or(isNull(unitMemberships.activeTo), gt(unitMemberships.activeTo, now)),
          ),
        ),
    );

    const societyRows = await this.drizzle.db
      .select({
        id: societyRoles.id,
        societyId: societyRoles.societyId,
        role: societyRoles.role,
        gateId: societyRoles.gateId,
        societyName: societies.name,
      })
      .from(societyRoles)
      .leftJoin(societies, eq(societyRoles.societyId, societies.id))
      .where(
        and(
          eq(societyRoles.userId, userId),
          eq(societyRoles.active, true),
        ),
      );

    // gates is RLS-protected (see ./schema/gates.ts); same is_superadmin bypass as the
    // units query above, for the same reason — this determines tenant scope, it can't
    // presuppose it.
    const gateRows = await this.drizzle.withSystemContext((tx) =>
      tx
        .select({
          id: gates.id,
          societyId: gates.societyId,
          name: gates.name,
        })
        .from(gates),
    );
    const gatesBySociety = new Map<string, typeof gateRows>();
    for (const g of gateRows) {
      const list = gatesBySociety.get(g.societyId) ?? [];
      list.push(g);
      gatesBySociety.set(g.societyId, list);
    }

    const gateContexts: GateContext[] = [];
    for (const r of societyRows) {
      if (r.role !== 'GUARD' && r.role !== 'GUARD_SUPERVISOR') continue;

      if (r.gateId) {
        // Assigned to one specific gate.
        const gate = gateRows.find((g) => g.id === r.gateId);
        gateContexts.push({
          id: `${r.id}:${r.gateId}`,
          gateId: r.gateId,
          gateName: gate?.name,
          societyId: r.societyId,
          societyName: r.societyName ?? undefined,
          role: r.role,
        });
        continue;
      }

      // Unrestricted (society-wide) row — every gate the society currently has is a
      // selectable context. A society with no gates defined yet contributes none; the
      // list fills in automatically once an admin creates one.
      for (const gate of gatesBySociety.get(r.societyId) ?? []) {
        gateContexts.push({
          id: `${r.id}:${gate.id}`,
          gateId: gate.id,
          gateName: gate.name,
          societyId: r.societyId,
          societyName: r.societyName ?? undefined,
          role: r.role,
        });
      }
    }

    return {
      units: unitRows.map((r) => ({
        id: r.id,
        unitId: r.unitId,
        role: r.role,
        isPrimary: r.isPrimary,
        unitNumber: r.unitNumber ?? undefined,
        buildingId: r.buildingId ?? undefined,
        buildingName: r.buildingName ?? undefined,
        societyId: r.societyId ?? '',
        societyName: r.societyName ?? undefined,
      })),
      societies: societyRows.map((r) => ({
        id: r.id,
        societyId: r.societyId,
        role: r.role,
        societyName: r.societyName ?? undefined,
      })),
      gates: gateContexts,
    };
  }

  /**
   * Asserts whether a user has the specified action permission within a scope.
   */
  async assertPermission(
    userId: string,
    action: string,
    scopeType: ScopeType,
    targetScopeId?: string,
  ): Promise<boolean> {
    const cachedPerms = await this.getOrLoadUserPermissions(userId);

    // 1. Superadmin has universal permission override
    if (cachedPerms.isSuperadmin) {
      return true;
    }

    const requiredGrant = `${action}@${scopeType}`;

    switch (scopeType) {
      case ScopeType.GLOBAL: {
        return cachedPerms.isSuperadmin;
      }

      case ScopeType.UNIT: {
        if (targetScopeId) {
          return cachedPerms.unitGrants.some(
            (ug) => ug.unitId === targetScopeId && ug.grants.includes(requiredGrant),
          );
        }
        return cachedPerms.unitGrants.some((ug) => ug.grants.includes(requiredGrant));
      }

      case ScopeType.SOCIETY: {
        if (targetScopeId) {
          return cachedPerms.societyGrants.some(
            (sg) => sg.societyId === targetScopeId && sg.grants.includes(requiredGrant),
          );
        }
        return cachedPerms.societyGrants.some((sg) => sg.grants.includes(requiredGrant));
      }

      case ScopeType.GATE: {
        if (targetScopeId) {
          // Direct check on society grants matching targetScopeId (if targetScopeId is
          // societyId) — only an unrestricted (gateId null) row counts here, since there's
          // no specific gate/device to compare a gate-scoped row's gateId against.
          const directMatch = cachedPerms.societyGrants.some(
            (sg) => sg.societyId === targetScopeId && sg.grants.includes(requiredGrant) && sg.gateId == null,
          );
          if (directMatch) return true;

          // Check if targetScopeId is a gate/device belonging to one of the user's societies
          const grantedSocietyIds = cachedPerms.societyGrants
            .filter((sg) => sg.grants.includes(requiredGrant))
            .map((sg) => sg.societyId);

          if (grantedSocietyIds.length === 0) {
            return false;
          }

          const [device] = await this.drizzle.db
            .select({ societyId: devices.societyId, gateId: devices.gateId })
            .from(devices)
            .where(
              or(
                eq(devices.gateId, targetScopeId),
                eq(devices.id, targetScopeId),
              ),
            )
            .limit(1);

          if (!device || !grantedSocietyIds.includes(device.societyId)) {
            return false;
          }

          // A society-wide grant (gateId null) covers every gate/device in that society,
          // same as before gate assignment existed. A gate-scoped grant only covers its
          // own gate, and only once the device itself has a gate assigned — a gate-scoped
          // guard gets no implicit access to a device nobody has mapped to a gate yet.
          return cachedPerms.societyGrants.some(
            (sg) =>
              sg.societyId === device.societyId &&
              sg.grants.includes(requiredGrant) &&
              (sg.gateId == null || (device.gateId != null && sg.gateId === device.gateId)),
          );
        }

        // If no targetScopeId is provided, check if user holds this GATE grant on any society
        return cachedPerms.societyGrants.some((sg) => sg.grants.includes(requiredGrant));
      }

      default:
        return false;
    }
  }

  /**
   * Resolves which society a scope target belongs to, purely so the caller (currently
   * only RbacScopeGuard) can set the request's RLS session context. Sourced from the
   * same cached grants assertPermission uses — normally a cache hit, no extra query.
   *
   * Returns undefined when there's no single society to scope to (GLOBAL routes, which
   * are superadmin-only) or when it can't be resolved at all; callers should treat that
   * as "no tenant scoping for this request" rather than an error — it doesn't affect the
   * pass/fail permission decision, which assertPermission already made independently.
   */
  async resolveScopeSocietyId(
    userId: string,
    scopeType: ScopeType,
    targetScopeId?: string,
  ): Promise<string | undefined> {
    if (!targetScopeId) {
      return undefined;
    }

    switch (scopeType) {
      case ScopeType.GLOBAL:
        return undefined;

      case ScopeType.SOCIETY:
        return targetScopeId;

      case ScopeType.UNIT: {
        const cachedPerms = await this.getOrLoadUserPermissions(userId);
        return cachedPerms.unitGrants.find((ug) => ug.unitId === targetScopeId)?.societyId || undefined;
      }

      case ScopeType.GATE: {
        const cachedPerms = await this.getOrLoadUserPermissions(userId);
        const directMatch = cachedPerms.societyGrants.find((sg) => sg.societyId === targetScopeId);
        if (directMatch) {
          return directMatch.societyId;
        }

        // Not a direct societyId — resolve via the device/gate mapping, same as
        // assertPermission's GATE branch. devices carries no RLS (see ./schema), so this
        // is a plain lookup, not a bypass.
        const [device] = await this.drizzle.db
          .select({ societyId: devices.societyId })
          .from(devices)
          .where(or(eq(devices.gateId, targetScopeId), eq(devices.id, targetScopeId)))
          .limit(1);

        return device?.societyId;
      }

      default:
        return undefined;
    }
  }

  /**
   * Invalidates cached permissions for a user across Redis and in-memory cache.
   */
  async invalidateUserPermsCache(userId: string): Promise<void> {
    const cacheKey = `perms:${userId}`;
    this.memoryCache.delete(cacheKey);

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.del(cacheKey);
      } catch (err: any) {
        this.logger.debug(`Redis cache invalidate error: ${err.message}`);
      }
    }
  }

  /**
   * Loads user permissions from cache or compiles them from the database.
   */
  private async getOrLoadUserPermissions(userId: string): Promise<CachedPermissions> {
    const cacheKey = `perms:${userId}`;

    // 1. Try Redis cache if available
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as CachedPermissions;
        }
      } catch (err: any) {
        this.logger.debug(`Redis cache read error: ${err.message}`);
      }
    }

    // 2. Try In-memory cache fallback
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.data;
    }

    // 3. Compile from database
    const [user] = await this.drizzle.db
      .select({ isSuperadmin: users.isSuperadmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const isSuperadmin = user?.isSuperadmin ?? false;
    const now = new Date();

    // See the identical comment in getUserContexts above: units is RLS-protected, and
    // this query is what determines a user's society-scoped grants in the first place.
    const unitMembershipsList = await this.drizzle.withSystemContext((tx) =>
      tx
        .select({
          unitId: unitMemberships.unitId,
          societyId: units.societyId,
          role: unitMemberships.role,
        })
        .from(unitMemberships)
        .innerJoin(units, eq(unitMemberships.unitId, units.id))
        .where(
          and(
            eq(unitMemberships.userId, userId),
            or(isNull(unitMemberships.activeTo), gt(unitMemberships.activeTo, now)),
          ),
        ),
    );

    const societyRolesList = await this.drizzle.db
      .select({
        societyId: societyRoles.societyId,
        role: societyRoles.role,
        gateId: societyRoles.gateId,
      })
      .from(societyRoles)
      .where(
        and(
          eq(societyRoles.userId, userId),
          eq(societyRoles.active, true),
        ),
      );

    const unitGrants = unitMembershipsList.map((m) => ({
      unitId: m.unitId,
      societyId: m.societyId ?? '',
      role: m.role,
      grants: ROLE_GRANTS[m.role] || [],
    }));

    const societyGrants = societyRolesList.map((r) => ({
      societyId: r.societyId,
      role: r.role,
      grants: ROLE_GRANTS[r.role] || [],
      gateId: r.gateId ?? null,
    }));

    const permissions: CachedPermissions = {
      isSuperadmin,
      unitGrants,
      societyGrants,
    };

    // Store in Redis with TTL
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(
          cacheKey,
          JSON.stringify(permissions),
          'EX',
          this.CACHE_TTL_SECONDS,
        );
      } catch (err: any) {
        this.logger.debug(`Redis cache write error: ${err.message}`);
      }
    }

    // Store in In-memory cache
    this.memoryCache.set(cacheKey, {
      data: permissions,
      expiresAt: Date.now() + this.CACHE_TTL_SECONDS * 1000,
    });

    return permissions;
  }
}
