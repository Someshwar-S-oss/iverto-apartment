import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [ConfigModule],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
