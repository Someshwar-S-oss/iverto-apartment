import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { RlsContextInterceptor } from './common/interceptors/rls-context.interceptor';
import { AccountThrottlerGuard } from './common/guards/account-throttler.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StaffModule } from './modules/staff/staff.module';
import { MediaModule } from './modules/media/media.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { EntryEventsModule } from './modules/entry-events/entry-events.module';
import { M50Module } from './modules/m50/m50.module';
import { CommunityModule } from './modules/community/community.module';
import { GatesModule } from './modules/gates/gates.module';
import { SuperadminController } from './controllers/web/superadmin.controller';
import { SocietyAdminController } from './controllers/web/society-admin.controller';
import { MobileAuthController } from './controllers/mobile/mobile-auth.controller';
import { MobileResidentController } from './controllers/mobile/mobile-resident.controller';
import {
  MobileGuardController,
  MobileEntryEventsController,
} from './controllers/mobile/mobile-guard.controller';

@Module({
  imports: [
    AppConfigModule,
    // Global baseline rate limit, keyed per authenticated account rather than per IP
    // (see AccountThrottlerGuard below) — a shared gate wifi with a shift's worth of
    // guards and a kiosk behind it is one IP, and IP-keying punished all of them as a
    // single client. Sensitive routes (login, passcode verify) layer a stricter
    // @Throttle() on top of this — see AuthController and MobileGuardController. Without
    // this baseline, login and passcode verification had no brute-force protection at
    // all, which matters more than usual here since initial passwords are deterministic
    // (`<phone>@iverto`) and passcodes are 6 digits.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    RbacModule,
    RealtimeModule,
    NotificationsModule,
    StaffModule,
    MediaModule,
    ApprovalsModule,
    EntryEventsModule,
    M50Module,
    CommunityModule,
    GatesModule,
    IdempotencyModule,
  ],
  controllers: [
    SuperadminController,
    SocietyAdminController,
    MobileAuthController,
    MobileResidentController,
    MobileGuardController,
    MobileEntryEventsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccountThrottlerGuard },
    // Runs after RbacScopeGuard on every request; see RlsContextInterceptor's doc
    // comment for what it does and why it's needed for RLS to actually take effect.
    { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
  ],
})
export class AppModule {}
