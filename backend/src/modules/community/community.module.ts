import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NoticesService } from './notices.service';
import { ComplaintsService } from './complaints.service';

@Module({
  imports: [DatabaseModule],
  providers: [NoticesService, ComplaintsService],
  exports: [NoticesService, ComplaintsService],
})
export class CommunityModule {}
