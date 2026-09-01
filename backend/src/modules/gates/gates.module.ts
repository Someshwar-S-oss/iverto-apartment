import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { GatesService } from './gates.service';

@Module({
  imports: [DatabaseModule],
  providers: [GatesService],
  exports: [GatesService],
})
export class GatesModule {}
