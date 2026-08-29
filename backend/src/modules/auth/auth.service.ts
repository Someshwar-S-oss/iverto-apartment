import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { users } from '../../database/schema/users';

export interface CreateUserInput {
  email: string;
  phone: string;
  name: string;
  isSuperadmin?: boolean;
  avatarKey?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwtService: JwtService,
  ) {}

  static generateTempPassword(phone: string): string {
    const sanitizedPhone = phone.replace(/[^0-9]/g, '');
    return `${sanitizedPhone}@iverto`;
  }

  generateTempPassword(phone: string): string {
    return AuthService.generateTempPassword(phone);
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

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      accessToken: this.jwtService.sign(payload),
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

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
      mustChangePassword: false,
    };

    return {
      accessToken: this.jwtService.sign(payload),
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
