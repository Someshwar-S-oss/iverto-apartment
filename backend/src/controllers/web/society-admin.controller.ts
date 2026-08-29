import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, count, gte } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { DrizzleService } from '../../database/drizzle.service';
import {
  buildings,
  units,
  users,
  unitMemberships,
  societyRoles,
  staff,
  devices,
  entryEvents,
} from '../../database/schema';
import { AuthService } from '../../modules/auth/auth.service';
import { StaffService } from '../../modules/staff/staff.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';

export interface CreateSocietyUserDto {
  email: string;
  phone: string;
  name: string;
  role: 'OWNER' | 'TENANT' | 'FAMILY' | 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN';
  unitId?: string;
  isPrimary?: boolean;
}

export interface CreateBuildingDto {
  name: string;
}

export interface CreateUnitDto {
  buildingId: string;
  unitNumber: string;
}

export interface UpdateStaffDto {
  name?: string;
  phone?: string;
  staffType?: 'MAID' | 'COOK' | 'DRIVER' | 'NANNY' | 'OTHER';
  photoData?: string;
  facePersonRef?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

@Controller('api/v1/web/societies/:societyId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class SocietyAdminController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly authService: AuthService,
    private readonly staffService: StaffService,
    private readonly entryEventsService: EntryEventsService,
  ) {}

  @Get('dashboard')
  @RequirePermission('entry.view', ScopeType.SOCIETY)
  async getDashboardStats(@Param('societyId') societyId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [unitsCount] = await this.drizzle.db
      .select({ count: count() })
      .from(units)
      .where(eq(units.societyId, societyId));

    const [staffCount] = await this.drizzle.db
      .select({ count: count() })
      .from(staff)
      .where(and(eq(staff.societyId, societyId), eq(staff.status, 'ACTIVE')));

    const [devicesCount] = await this.drizzle.db
      .select({ count: count() })
      .from(devices)
      .where(eq(devices.societyId, societyId));

    const [todayEntries] = await this.drizzle.db
      .select({ count: count() })
      .from(entryEvents)
      .where(
        and(
          eq(entryEvents.societyId, societyId),
          gte(entryEvents.occurredAt, todayStart),
        ),
      );

    return {
      totalUnits: Number(unitsCount?.count || 0),
      activeStaff: Number(staffCount?.count || 0),
      totalDevices: Number(devicesCount?.count || 0),
      todayEntries: Number(todayEntries?.count || 0),
    };
  }

  @Post('users')
  @RequirePermission('member.manage', ScopeType.SOCIETY)
  async createUser(
    @Param('societyId') societyId: string,
    @Body() body: CreateSocietyUserDto,
  ) {
    if (!body.email || !body.phone || !body.name || !body.role) {
      throw new BadRequestException('email, phone, name, and role are required');
    }

    const unitRoles = ['OWNER', 'TENANT', 'FAMILY'];
    const societyRolesList = ['GUARD', 'GUARD_SUPERVISOR', 'SOCIETY_ADMIN'];

    if (unitRoles.includes(body.role) && !body.unitId) {
      throw new BadRequestException(`unitId is required for role ${body.role}`);
    }

    if (body.unitId) {
      const [unit] = await this.drizzle.db
        .select()
        .from(units)
        .where(and(eq(units.id, body.unitId), eq(units.societyId, societyId)))
        .limit(1);

      if (!unit) {
        throw new NotFoundException(`Unit ${body.unitId} not found in society ${societyId}`);
      }
    }

    const rawTempPassword = AuthService.generateTempPassword(body.phone);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawTempPassword, salt);

    const [existingUser] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase().trim()))
      .limit(1);

    let user = existingUser;
    if (!user) {
      const [newUser] = await this.drizzle.db
        .insert(users)
        .values({
          email: body.email.toLowerCase().trim(),
          phone: body.phone.trim(),
          name: body.name.trim(),
          passwordHash,
          isSuperadmin: false,
          mustChangePassword: true,
          status: 'ACTIVE',
        })
        .returning();
      user = newUser;
    }

    if (unitRoles.includes(body.role) && body.unitId) {
      await this.drizzle.db.insert(unitMemberships).values({
        userId: user.id,
        unitId: body.unitId,
        role: body.role as 'OWNER' | 'TENANT' | 'FAMILY',
        isPrimary: body.isPrimary ?? false,
      });
    } else if (societyRolesList.includes(body.role)) {
      await this.drizzle.db.insert(societyRoles).values({
        userId: user.id,
        societyId,
        role: body.role as 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN',
        active: true,
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
      },
      role: body.role,
      unitId: body.unitId,
      tempPassword: rawTempPassword,
    };
  }

  @Get('units')
  @RequirePermission('unit.manage', ScopeType.SOCIETY)
  async listUnits(@Param('societyId') societyId: string) {
    const rows = await this.drizzle.db
      .select({
        id: units.id,
        unitNumber: units.unitNumber,
        buildingId: units.buildingId,
        buildingName: buildings.name,
        societyId: units.societyId,
      })
      .from(units)
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .where(eq(units.societyId, societyId));

    return rows;
  }

  @Post('buildings')
  @RequirePermission('unit.manage', ScopeType.SOCIETY)
  async createBuilding(
    @Param('societyId') societyId: string,
    @Body() body: CreateBuildingDto,
  ) {
    if (!body.name) {
      throw new BadRequestException('Building name is required');
    }

    const [building] = await this.drizzle.db
      .insert(buildings)
      .values({
        societyId,
        name: body.name.trim(),
      })
      .returning();

    return building;
  }

  @Post('units')
  @RequirePermission('unit.manage', ScopeType.SOCIETY)
  async createUnit(
    @Param('societyId') societyId: string,
    @Body() body: CreateUnitDto,
  ) {
    if (!body.buildingId || !body.unitNumber) {
      throw new BadRequestException('buildingId and unitNumber are required');
    }

    const [building] = await this.drizzle.db
      .select()
      .from(buildings)
      .where(and(eq(buildings.id, body.buildingId), eq(buildings.societyId, societyId)))
      .limit(1);

    if (!building) {
      throw new NotFoundException(`Building ${body.buildingId} not found in this society`);
    }

    const [unit] = await this.drizzle.db
      .insert(units)
      .values({
        societyId,
        buildingId: body.buildingId,
        unitNumber: body.unitNumber.trim(),
      })
      .returning();

    return unit;
  }

  @Get('staff')
  @RequirePermission('staff.manage', ScopeType.SOCIETY)
  async listStaff(
    @Param('societyId') societyId: string,
    @Query('status') status?: 'ACTIVE' | 'INACTIVE',
  ) {
    return this.staffService.listStaffBySociety(societyId, status);
  }

  @Post('staff')
  @RequirePermission('staff.manage', ScopeType.SOCIETY)
  async createStaff(
    @Param('societyId') societyId: string,
    @Body() body: any,
  ) {
    return this.staffService.createStaff(societyId, body);
  }

  @Patch('staff/:id')
  @RequirePermission('staff.manage', ScopeType.SOCIETY)
  async updateStaff(
    @Param('societyId') societyId: string,
    @Param('id') staffId: string,
    @Body() body: UpdateStaffDto,
  ) {
    const updatePayload: Record<string, any> = {};
    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.phone !== undefined) updatePayload.phone = body.phone.trim();
    if (body.staffType !== undefined) updatePayload.staffType = body.staffType;
    if (body.photoData !== undefined) updatePayload.photoData = body.photoData;
    if (body.facePersonRef !== undefined) updatePayload.facePersonRef = body.facePersonRef?.trim() || null;
    if (body.status !== undefined) updatePayload.status = body.status;

    const [updated] = await this.drizzle.db
      .update(staff)
      .set(updatePayload)
      .where(and(eq(staff.id, staffId), eq(staff.societyId, societyId)))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Staff ${staffId} not found in society ${societyId}`);
    }

    return updated;
  }

  @Get('logs')
  @RequirePermission('entry.view', ScopeType.SOCIETY)
  async getLogs(
    @Param('societyId') societyId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.entryEventsService.listSocietyEntryEvents(
      societyId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 50,
    );
  }

  @Get('devices')
  @RequirePermission('device.manage', ScopeType.SOCIETY)
  async listDevices(@Param('societyId') societyId: string) {
    return this.drizzle.db
      .select()
      .from(devices)
      .where(eq(devices.societyId, societyId));
  }
}
