import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [DatabaseModule, RealtimeModule],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
