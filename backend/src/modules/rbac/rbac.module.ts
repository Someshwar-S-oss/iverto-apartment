import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { RbacService } from './rbac.service';
import { RbacScopeGuard } from './guards/rbac-scope.guard';

@Global()
@Module({
  imports: [DatabaseModule, ConfigModule],
  providers: [RbacService, RbacScopeGuard],
  exports: [RbacService, RbacScopeGuard],
})
export class RbacModule {}
