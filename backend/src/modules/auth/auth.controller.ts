import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller(['auth', 'api/v1/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login with Email and Password' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Initial passwords are deterministic (`<phone>@iverto`), so login is the single
  // highest-value brute-force target in this system — throttle well below the global
  // per-IP default.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @ApiOperation({ summary: 'Change Password (Mandatory on First Login)' })
  @ApiBearerAuth('JWT-auth')
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const userId = req.user?.id || req.user?.sub || req.user?.userId;
    return this.authService.changePassword(userId, dto.newPassword);
  }

  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // No JwtAuthGuard here on purpose — the access token is exactly what the caller no
  // longer has (or is about to expire); the refresh token itself, not a bearer JWT, is
  // the credential this endpoint authenticates. Still throttled: unlike a password, a
  // stolen/guessed refresh token grants a session directly, so this is as sensitive a
  // target as login.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Revoke a refresh token (logout on this device)' })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(dto.refreshToken);
    return { success: true };
  }
}
