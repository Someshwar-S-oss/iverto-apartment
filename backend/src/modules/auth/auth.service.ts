import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { users } from '../../database/schema/users';
import { refreshTokens } from '../../database/schema/refresh-tokens';

export interface CreateUserInput {
  email: string;
  phone: string;
  name: string;
  isSuperadmin?: boolean;
  avatarKey?: string | null;
}

/**
 * Parses the small subset of duration strings this app's own config ever produces
 * (`"30d"`, `"15m"`, `"24h"`, `"90s"`, or a bare number of ms) into milliseconds. Not a
 * general-purpose duration parser — deliberately just enough to cover
 * JWT_REFRESH_EXPIRES_IN, to avoid pulling in a dependency for one config value.
 */
export function parseDurationMs(input: string, fallbackMs: number): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(input.trim());
  if (!match) {
    return fallbackMs;
  }

  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'ms').toLowerCase();

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TOKEN_BYTES = 40;

@Injectable()
export class AuthService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  static generateTempPassword(phone: string): string {
    const sanitizedPhone = phone.replace(/[^0-9]/g, '');
    return `${sanitizedPhone}@iverto`;
  }

  generateTempPassword(phone: string): string {
    return AuthService.generateTempPassword(phone);
  }

  private hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Issues a new refresh token row and returns the raw (unhashed) token to send to the
   * client — only the hash is ever persisted, see refresh-tokens.ts's doc comment.
   */
  private async issueRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const ttlMs = parseDurationMs(
      this.config.get<string>('jwt.refreshExpiresIn') || '30d',
      DEFAULT_REFRESH_TOKEN_TTL_MS,
    );

    await this.drizzle.db.insert(refreshTokens).values({
      userId,
      tokenHash: this.hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMs),
    });

    return rawToken;
  }

  private signAccessToken(user: {
    id: string;
    email: string;
    isSuperadmin: boolean;
    mustChangePassword: boolean;
  }): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: user.mustChangePassword,
    });
  }

  async login(email: string, pass: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user || !(await bcrypt.compare(pass, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended');
    }

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isSuperadmin: user.isSuperadmin,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Exchanges a refresh token for a new access token, rotating the refresh token in the
   * same call (the old one is marked revoked + linked to its replacement; a fresh one is
   * issued). Rotation means a stolen-then-used token immediately stops working for
   * whoever legitimately held it next — which is also how reuse gets caught: if this
   * *same* already-revoked-and-replaced token is presented again, the legitimate client
   * would have moved on to its replacement already, so a repeat means someone else has
   * it. Treated as a compromise signal: every refresh token for the user is revoked,
   * forcing a real re-login everywhere.
   */
  async refreshAccessToken(rawToken: string) {
    const tokenHash = this.hashRefreshToken(rawToken);

    const [record] = await this.drizzle.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      if (record.replacedByTokenId) {
        // Reuse of an already-rotated token — see doc comment above.
        await this.drizzle.db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));
      }
      throw new UnauthorizedException('Refresh token has already been used or revoked');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    const newRawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const ttlMs = parseDurationMs(
      this.config.get<string>('jwt.refreshExpiresIn') || '30d',
      DEFAULT_REFRESH_TOKEN_TTL_MS,
    );

    const [newRecord] = await this.drizzle.db
      .insert(refreshTokens)
      .values({
        userId: user.id,
        tokenHash: this.hashRefreshToken(newRawToken),
        expiresAt: new Date(Date.now() + ttlMs),
      })
      .returning();

    await this.drizzle.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenId: newRecord.id })
      .where(eq(refreshTokens.id, record.id));

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: newRawToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isSuperadmin: user.isSuperadmin,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /** Revokes one refresh token (logout on this device only). Idempotent. */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawToken);
    await this.drizzle.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async changePassword(userId: string, newPass: string) {
    if (!newPass || newPass.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPass, salt);

    await this.drizzle.db
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(users.id, userId));

    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // A password change is a credential rotation — every existing session's refresh
    // token is revoked so a stolen-but-not-yet-used one can't outlive the reason it was
    // rotated in the first place. This device gets a fresh one immediately after.
    await this.drizzle.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

    const accessToken = this.signAccessToken({
      id: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: false,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      message: 'Password changed successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isSuperadmin: user.isSuperadmin,
        mustChangePassword: false,
      },
    };
  }

  async createUser(
    inputOrEmail: string | CreateUserInput,
    phoneOrTx?: string | any,
    name?: string,
    isSuperadmin?: boolean,
    tx?: any,
  ) {
    let email: string;
    let phone: string;
    let userName: string;
    let superadmin = false;
    let avatarKey: string | null = null;
    let dbClient: any;

    if (typeof inputOrEmail === 'object') {
      email = inputOrEmail.email;
      phone = inputOrEmail.phone;
      userName = inputOrEmail.name;
      superadmin = inputOrEmail.isSuperadmin ?? false;
      avatarKey = inputOrEmail.avatarKey ?? null;
      dbClient = phoneOrTx || this.drizzle.db;
    } else {
      email = inputOrEmail;
      phone = phoneOrTx as string;
      userName = name as string;
      superadmin = isSuperadmin ?? false;
      dbClient = tx || this.drizzle.db;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const tempPassword = AuthService.generateTempPassword(phone);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    const [createdUser] = await dbClient
      .insert(users)
      .values({
        email: normalizedEmail,
        phone: phone.trim(),
        name: userName.trim(),
        passwordHash,
        isSuperadmin: superadmin,
        mustChangePassword: true,
        status: 'ACTIVE',
        avatarKey,
      })
      .returning();

    return {
      ...createdUser,
      tempPassword,
    };
  }
}
