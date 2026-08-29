import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import {
  buildings,
  devices,
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

export interface UserContextsResponse {
  units: UnitMembershipContext[];
  societies: SocietyRoleContext[];
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
      if (redisUrl) {
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
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

    const unitRows = await this.drizzle.db
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
      );

    const societyRows = await this.drizzle.db
      .select({
        id: societyRoles.id,
        societyId: societyRoles.societyId,
        role: societyRoles.role,
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
          // Direct check on society grants matching targetScopeId (if targetScopeId is societyId)
          const directMatch = cachedPerms.societyGrants.some(
            (sg) => sg.societyId === targetScopeId && sg.grants.includes(requiredGrant),
          );
          if (directMatch) return true;

          // Check if targetScopeId is a gate/device belonging to one of the user's societies
          const userSocietyIds = cachedPerms.societyGrants
            .filter((sg) => sg.grants.includes(requiredGrant))
            .map((sg) => sg.societyId);

          if (userSocietyIds.length > 0) {
            const [device] = await this.drizzle.db
              .select({ societyId: devices.societyId })
              .from(devices)
              .where(
                or(
                  eq(devices.gateId, targetScopeId),
                  eq(devices.id, targetScopeId),
                ),
              )
              .limit(1);

            if (device && userSocietyIds.includes(device.societyId)) {
              return true;
            }
          }

          return false;
        }

        // If no targetScopeId is provided, check if user holds this GATE grant on any society
        return cachedPerms.societyGrants.some((sg) => sg.grants.includes(requiredGrant));
      }

      default:
        return false;
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

    const unitMembershipsList = await this.drizzle.db
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
      );

    const societyRolesList = await this.drizzle.db
      .select({
        societyId: societyRoles.societyId,
        role: societyRoles.role,
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
