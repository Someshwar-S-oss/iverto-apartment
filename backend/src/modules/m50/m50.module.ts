import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { StaffModule } from '../staff/staff.module';
import { M50Service } from './m50.service';
import { M50Server } from './m50.server';

@Module({
  imports: [ConfigModule, DatabaseModule, forwardRef(() => StaffModule)],
  providers: [M50Service, M50Server],
  exports: [M50Service, M50Server],
})
export class M50Module {}
