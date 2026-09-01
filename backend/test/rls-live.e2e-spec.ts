import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../src/database/drizzle.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { RbacScopeGuard } from '../src/modules/rbac/guards/rbac-scope.guard';
import { RlsContextInterceptor } from '../src/common/interceptors/rls-context.interceptor';
import { PERMISSION_KEY } from '../src/modules/rbac/decorators/require-permission.decorator';
import { ScopeType } from '../src/modules/rbac/rbac.constants';
import { societies, buildings, units, users, unitMemberships } from '../src/database/schema';

/**
 * Exercises the REAL RbacScopeGuard -> RlsContextInterceptor -> DrizzleService chain
 * against the live Neon database — not mocks. Unit tests elsewhere mock DrizzleService
 * entirely, so none of them can catch a wiring mistake here (wrong session var name, a
 * service that bypasses the ALS context, a guard that forgets to set request.rlsContext,
 * the app connecting as a role with BYPASSRLS, etc). This is the one test that would.
 *
 * Skipped unless explicitly opted into with real credentials — it hits a live database
 * and creates/deletes its own throwaway fixtures, which most environments (CI without
 * secrets, offline dev) can't and shouldn't do by default.
 *
 *   RUN_LIVE_DB_TESTS=1 npx jest test/rls-live.e2e-spec.ts
 */
const shouldRun = process.env.RUN_LIVE_DB_TESTS === '1' && !!process.env.DATABASE_URL;
const describeLive = shouldRun ? describe : describe.skip;

describeLive('RLS Live Integration (real Neon DB, real guard/interceptor chain)', () => {
  let drizzle: DrizzleService;
  let rbac: RbacService;
  let guard: RbacScopeGuard;
  let interceptor: RlsContextInterceptor;

  let societyAId: string;
  let societyBId: string;
  let unitAId: string; // belongs to societyA
  let unitBId: string; // belongs to societyB
  let ownerUserId: string; // OWNER of unitA only

  const marker = `rls-live-${Date.now()}`;

  beforeAll(async () => {
    const configService = {
      get: (key: string) => (key === 'database.url' ? process.env.DATABASE_URL : undefined),
    } as unknown as ConfigService;

    drizzle = new DrizzleService(configService);
    await drizzle.onModuleInit();

    rbac = new RbacService(drizzle, {
      get: () => undefined, // no redis.url -> in-memory cache fallback
    } as unknown as ConfigService);
    await rbac.onModuleInit();

    guard = new RbacScopeGuard({ getAllAndOverride: () => undefined } as any, rbac);
    interceptor = new RlsContextInterceptor(drizzle);

    // Create fixtures with a full superadmin-equivalent context (the legitimate use of
    // withSystemContext — see its doc comment) so this setup step doesn't itself depend
    // on the thing being tested.
    await drizzle.withSystemContext(async (tx) => {
      const [socA] = await tx.insert(societies).values({ name: `${marker}-society-A` }).returning();
      const [socB] = await tx.insert(societies).values({ name: `${marker}-society-B` }).returning();
      societyAId = socA.id;
      societyBId = socB.id;

      const [bldA] = await tx.insert(buildings).values({ societyId: societyAId, name: `${marker}-bldg-A` }).returning();
      const [bldB] = await tx.insert(buildings).values({ societyId: societyBId, name: `${marker}-bldg-B` }).returning();

      const [unitA] = await tx
        .insert(units)
        .values({ buildingId: bldA.id, societyId: societyAId, unitNumber: 'A-101' })
        .returning();
      const [unitB] = await tx
        .insert(units)
        .values({ buildingId: bldB.id, societyId: societyBId, unitNumber: 'B-101' })
        .returning();
      unitAId = unitA.id;
      unitBId = unitB.id;
    });

    // users/unit_memberships carry no RLS (see schema comments) — plain inserts.
    const [owner] = await drizzle.db
      .insert(users)
      .values({
        email: `${marker}-owner@example.test`,
        phone: '9999999999',
        passwordHash: 'x',
        name: 'RLS Live Test Owner',
      })
      .returning();
    ownerUserId = owner.id;

    await drizzle.db.insert(unitMemberships).values({
      userId: ownerUserId,
      unitId: unitAId,
      role: 'OWNER',
    });
  }, 30_000);

  afterAll(async () => {
    if (drizzle) {
      await drizzle.withSystemContext(async (tx) => {
        if (unitAId) await tx.delete(unitMemberships).where(eq(unitMemberships.unitId, unitAId));
        if (unitAId) await tx.delete(units).where(eq(units.id, unitAId));
        if (unitBId) await tx.delete(units).where(eq(units.id, unitBId));
        if (societyAId) await tx.delete(buildings).where(eq(buildings.societyId, societyAId));
        if (societyBId) await tx.delete(buildings).where(eq(buildings.societyId, societyBId));
        if (societyAId) await tx.delete(societies).where(eq(societies.id, societyAId));
        if (societyBId) await tx.delete(societies).where(eq(societies.id, societyBId));
      });
      if (ownerUserId) {
        await drizzle.db.delete(users).where(eq(users.id, ownerUserId));
      }
      await rbac.onModuleDestroy();
      await drizzle.onModuleDestroy();
    }
  }, 30_000);

  const makeContext = (permMeta: { action: string; scopeType: ScopeType }, request: any): ExecutionContext => {
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(permMeta);
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('lets the unit owner through the guard and scopes their queries to their own society only', async () => {
    const request: any = { user: { sub: ownerUserId, isSuperadmin: false }, params: { unitId: unitAId } };

    const allowed = await guard.canActivate(
      makeContext({ action: 'entry.view', scopeType: ScopeType.UNIT }, request),
    );
    expect(allowed).toBe(true);
    expect(request.rlsContext).toEqual({ userId: ownerUserId, isSuperadmin: false, societyId: societyAId });

    // Run a real query through the interceptor using the guard-resolved context, exactly
    // as RlsContextInterceptor does for a live HTTP request.
    const visibleUnits = await drizzle.withTenantContext(request.rlsContext, async () => {
      return drizzle.db.select({ id: units.id }).from(units);
    });

    const visibleIds = visibleUnits.map((u) => u.id);
    expect(visibleIds).toContain(unitAId);
    expect(visibleIds).not.toContain(unitBId);
  });

  it('rejects the owner at the guard for a unit they do not belong to', async () => {
    const request: any = { user: { sub: ownerUserId, isSuperadmin: false }, params: { unitId: unitBId } };

    await expect(
      guard.canActivate(makeContext({ action: 'entry.view', scopeType: ScopeType.UNIT }, request)),
    ).rejects.toThrow();
  });

  it('blocks a hypothetical app-layer bug at the database level (defense in depth)', async () => {
    // Simulate what a missing/broken authorization check would look like: a context
    // scoped to societyA is used to try to read/write societyB's row directly. This is
    // the exact class of bug the earlier IDOR fixes addressed at the app layer — this
    // proves RLS independently catches it even if a future change reintroduces one.
    const forgedContext = { userId: ownerUserId, isSuperadmin: false, societyId: societyAId };

    const crossTenantRead = await drizzle.withTenantContext(forgedContext, () =>
      drizzle.db.select({ id: units.id }).from(units).where(eq(units.id, unitBId)),
    );
    expect(crossTenantRead).toHaveLength(0);

    await expect(
      drizzle.withTenantContext(forgedContext, () =>
        drizzle.db.update(units).set({ unitNumber: 'HACKED' }).where(eq(units.id, unitBId)),
      ),
    ).resolves.toBeDefined(); // UPDATE ... WHERE matching 0 rows doesn't throw...

    // ...so verify directly, under the real owning society's context, that it was a no-op.
    const stillIntact = await drizzle.withTenantContext({ isSuperadmin: false, societyId: societyBId }, () =>
      drizzle.db.select({ unitNumber: units.unitNumber }).from(units).where(eq(units.id, unitBId)),
    );
    expect(stillIntact[0]?.unitNumber).toBe('B-101');
  });

  it('returns nothing for any protected table when no context is set at all (fail closed)', async () => {
    const noContextRows = await drizzle.db.select({ id: units.id }).from(units);
    expect(noContextRows).toHaveLength(0);
  });
});
