import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule exports the configured JwtModule/JwtService the gateway needs to verify
  // socket connections; RbacService is available via the @Global() RbacModule.
  imports: [AuthModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
