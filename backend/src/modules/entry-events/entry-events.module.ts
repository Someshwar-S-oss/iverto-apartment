import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { MediaModule } from '../media/media.module';
import { EntryEventsService } from './entry-events.service';

@Module({
  imports: [
    DatabaseModule,
    RealtimeModule,
    NotificationsModule,
    ApprovalsModule,
    MediaModule,
  ],
  providers: [EntryEventsService],
  exports: [EntryEventsService],
})
export class EntryEventsModule {}
