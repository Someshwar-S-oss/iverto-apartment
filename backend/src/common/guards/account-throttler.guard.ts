import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * Keys rate limits on the authenticated account instead of the request's IP address —
 * the default `ThrottlerGuard` behaviour, which punishes a busy gate's shared wifi
 * (one IP, a whole shift's worth of guards and a kiosk behind it) as if it were one
 * abusive client. Login itself has no account yet, so it — and any other unauthenticated
 * request — still falls back to IP, same as before.
 *
 * `getTracker` runs inside the global `ThrottlerGuard` (registered via APP_GUARD in
 * AppModule), which executes before any route-level `@UseGuards(JwtAuthGuard, ...)` —
 * so `request.user` is never populated yet at this point, and this can't just reuse
 * `CurrentUser`/Passport's result. Instead it decodes the bearer token itself, without
 * verifying its signature: that's fine here because a tracker key only needs to *look
 * like* an account to bucket requests by it, and doesn't grant anything — an invalid or
 * forged token still gets rejected downstream by the real `JwtAuthGuard` exactly as
 * before. Worst case of trusting an unverified `sub` here is a wasted rate-limit bucket,
 * never an auth bypass.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authHeader: string | undefined = req.headers?.authorization || req.headers?.Authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      try {
        const decoded = this.jwtService.decode(token) as { sub?: string } | null;
        if (decoded?.sub) {
          return `user:${decoded.sub}`;
        }
      } catch {
        // Malformed token — fall through to IP, same as no token at all.
      }
    }

    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
