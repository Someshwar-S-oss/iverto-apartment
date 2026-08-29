import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffService } from './staff.service';
import { FanoutService } from './fanout.service';

@Module({
  imports: [DatabaseModule, RealtimeModule, NotificationsModule],
  providers: [StaffService, FanoutService],
  exports: [StaffService, FanoutService],
})
export class StaffModule {}
