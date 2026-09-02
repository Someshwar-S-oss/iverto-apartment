import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { RbacService } from '../../modules/rbac/rbac.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

export interface RegisterDeviceTokenDto {
  fcmToken: string;
  platform: 'android' | 'ios' | 'web';
}

export interface UnregisterDeviceTokenDto {
  fcmToken: string;
}

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Mobile - Auth')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/mobile')
@UseGuards(JwtAuthGuard, PasswordChangeGuard)
export class MobileAuthController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('me/contexts')
  async getMyContexts(@CurrentUser('sub') userId: string) {
    return this.rbacService.getUserContexts(userId);
  }

  @Post('me/device-token')
  async registerDeviceToken(
    @CurrentUser('sub') userId: string,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    if (!body.fcmToken || !body.platform) {
      throw new BadRequestException('fcmToken and platform are required');
    }

    return this.notificationsService.registerDeviceToken(
      userId,
      body.fcmToken,
      body.platform,
    );
  }

  // Called on sign-out — see NotificationsService.unregisterDeviceToken for why this
  // needs to exist at all: sign-out used to only stop the app from re-registering, never
  // told the service to stop sending.
  @Delete('me/device-token')
  async unregisterDeviceToken(
    @CurrentUser('sub') userId: string,
    @Body() body: UnregisterDeviceTokenDto,
  ) {
    if (!body.fcmToken) {
      throw new BadRequestException('fcmToken is required');
    }

    return this.notificationsService.unregisterDeviceToken(userId, body.fcmToken);
  }
}
