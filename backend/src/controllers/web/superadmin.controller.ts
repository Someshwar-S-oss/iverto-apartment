import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, eq, count } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { DrizzleService } from '../../database/drizzle.service';
import { societies, users, societyRoles, devices, entryEvents, gates } from '../../database/schema';
import { AuthService } from '../../modules/auth/auth.service';

export interface CreateSocietyDto {
  name: string;
  timezone?: string;
  address?: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
}

export interface UpdateSocietyStatusDto {
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface ProvisionDeviceDto {
  societyId: string;
  gateId?: string;
  vendor: 'M50' | 'ZKTECO' | 'ESSL' | 'MATRIX' | 'OTHER';
  serialNo: string;
  name?: string;
  authToken?: string;
}

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Web - Superadmin')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/web/superadmin')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class SuperadminController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly authService: AuthService,
  ) {}

  @Post('societies')
  @RequirePermission('society.create', ScopeType.GLOBAL)
  async createSociety(@Body() body: CreateSocietyDto) {
    if (!body.name || !body.adminEmail || !body.adminPhone || !body.adminName) {
      throw new BadRequestException('Missing required fields for society onboarding');
    }

    // 1. Create Society
    const [society] = await this.drizzle.db
      .insert(societies)
      .values({
        name: body.name,
        timezone: body.timezone || 'Asia/Kolkata',
        address: body.address || null,
        status: 'ACTIVE',
      })
      .returning();

    // 2. Generate temp password and hash
    const rawTempPassword = AuthService.generateTempPassword(body.adminPhone);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawTempPassword, salt);

    // 3. Create or find master admin user
    const [existingUser] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, body.adminEmail.toLowerCase().trim()))
      .limit(1);

    let adminUser = existingUser;
    if (!adminUser) {
      const [newUser] = await this.drizzle.db
        .insert(users)
        .values({
          email: body.adminEmail.toLowerCase().trim(),
          phone: body.adminPhone.trim(),
          name: body.adminName.trim(),
          passwordHash,
          isSuperadmin: false,
          mustChangePassword: true,
          status: 'ACTIVE',
        })
        .returning();
      adminUser = newUser;
    }

    // 4. Assign SOCIETY_ADMIN role
    await this.drizzle.db
      .insert(societyRoles)
      .values({
        userId: adminUser.id,
        societyId: society.id,
        role: 'SOCIETY_ADMIN',
        active: true,
      });

    return {
      society,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        phone: adminUser.phone,
        tempPassword: rawTempPassword,
      },
    };
  }

  @Get('societies')
  @RequirePermission('society.create', ScopeType.GLOBAL)
  async listSocieties() {
    return this.drizzle.db.select().from(societies);
  }

  @Patch('societies/:id')
  @RequirePermission('society.create', ScopeType.GLOBAL)
  async updateSocietyStatus(
    @Param('id') id: string,
    @Body() body: UpdateSocietyStatusDto,
  ) {
    if (!body.status || !['ACTIVE', 'SUSPENDED'].includes(body.status)) {
      throw new BadRequestException('Valid status is required (ACTIVE, SUSPENDED)');
    }

    const [updated] = await this.drizzle.db
      .update(societies)
      .set({ status: body.status })
      .where(eq(societies.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Society ${id} not found`);
    }

    return updated;
  }

  @Post('devices')
  @RequirePermission('device.manage', ScopeType.GLOBAL)
  async provisionDevice(@Body() body: ProvisionDeviceDto) {
    if (!body.societyId || !body.serialNo || !body.vendor) {
      throw new BadRequestException('societyId, serialNo, and vendor are required');
    }

    // devices.gateId is a real FK now (was a bare uuid) — validate up front for a clean
    // 404 instead of letting an unknown/cross-society gate id fall through to a raw FK
    // violation.
    if (body.gateId) {
      const [gate] = await this.drizzle.db
        .select({ id: gates.id })
        .from(gates)
        .where(and(eq(gates.id, body.gateId), eq(gates.societyId, body.societyId)))
        .limit(1);

      if (!gate) {
        throw new NotFoundException(`Gate ${body.gateId} not found in society ${body.societyId}`);
      }
    }

    const [device] = await this.drizzle.db
      .insert(devices)
      .values({
        societyId: body.societyId,
        gateId: body.gateId || null,
        vendor: body.vendor,
        serialNo: body.serialNo.trim(),
        name: body.name || null,
        authToken: body.authToken || null,
        status: 'OFFLINE',
      })
      .returning();

    return device;
  }

  @Get('devices')
  @RequirePermission('device.manage', ScopeType.GLOBAL)
  async listDevices() {
    return this.drizzle.db
      .select({
        id: devices.id,
        societyId: devices.societyId,
        gateId: devices.gateId,
        gateName: gates.name,
        vendor: devices.vendor,
        serialNo: devices.serialNo,
        name: devices.name,
        authToken: devices.authToken,
        lastHeartbeatAt: devices.lastHeartbeatAt,
        status: devices.status,
        createdAt: devices.createdAt,
      })
      .from(devices)
      .leftJoin(gates, eq(devices.gateId, gates.id));
  }

  @Get('societies/:societyId/gates')
  @RequirePermission('device.manage', ScopeType.GLOBAL)
  async listGatesForProvisioning(@Param('societyId') societyId: string) {
    return this.drizzle.db
      .select()
      .from(gates)
      .where(eq(gates.societyId, societyId));
  }

  @Get('analytics')
  @RequirePermission('society.create', ScopeType.GLOBAL)
  async getAnalytics() {
    const [societiesCount] = await this.drizzle.db
      .select({ count: count() })
      .from(societies);

    const [devicesCount] = await this.drizzle.db
      .select({ count: count() })
      .from(devices);

    const [usersCount] = await this.drizzle.db
      .select({ count: count() })
      .from(users);

    const [entriesCount] = await this.drizzle.db
      .select({ count: count() })
      .from(entryEvents);

    return {
      totalSocieties: Number(societiesCount?.count || 0),
      totalDevices: Number(devicesCount?.count || 0),
      totalUsers: Number(usersCount?.count || 0),
      totalEntryEvents: Number(entriesCount?.count || 0),
    };
  }
}
