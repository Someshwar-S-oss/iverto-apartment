import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { M50Service } from './m50.service';
import { M50Server } from './m50.server';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [M50Service, M50Server],
  exports: [M50Service, M50Server],
})
export class M50Module {}
