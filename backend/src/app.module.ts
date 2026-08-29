import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
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
  ],
  controllers: [
    SuperadminController,
    SocietyAdminController,
    MobileAuthController,
    MobileResidentController,
    MobileGuardController,
    MobileEntryEventsController,
  ],
})
export class AppModule {}
