import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
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
  gates,
} from '../../database/schema';
import { AuthService } from '../../modules/auth/auth.service';
import { StaffService } from '../../modules/staff/staff.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { NoticesService, CreateNoticeDto } from '../../modules/community/notices.service';
import {
  ComplaintsService,
  UpdateComplaintStatusDto,
} from '../../modules/community/complaints.service';
import { GatesService, CreateGateDto, UpdateGateDto } from '../../modules/gates/gates.service';

export interface CreateSocietyUserDto {
  email: string;
  phone: string;
  name: string;
  role: 'OWNER' | 'TENANT' | 'FAMILY' | 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN';
  unitId?: string;
  isPrimary?: boolean;
  // Only meaningful for GUARD/GUARD_SUPERVISOR. Omitted or null = unrestricted (every
  // gate in the society) — the default for GUARD_SUPERVISOR and for a GUARD nobody has
  // assigned to a specific gate yet.
  gateId?: string | null;
}

export interface AssignGuardGateDto {
  gateId: string | null;
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

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Web - Society Admin')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/web/societies/:societyId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class SocietyAdminController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly authService: AuthService,
    private readonly staffService: StaffService,
    private readonly entryEventsService: EntryEventsService,
    private readonly noticesService: NoticesService,
    private readonly complaintsService: ComplaintsService,
    private readonly gatesService: GatesService,
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

    if (body.gateId && (body.role === 'GUARD' || body.role === 'GUARD_SUPERVISOR')) {
      const [gate] = await this.drizzle.db
        .select({ id: gates.id })
        .from(gates)
        .where(and(eq(gates.id, body.gateId), eq(gates.societyId, societyId)))
        .limit(1);

      if (!gate) {
        throw new NotFoundException(`Gate ${body.gateId} not found in society ${societyId}`);
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
      const isGuardRole = body.role === 'GUARD' || body.role === 'GUARD_SUPERVISOR';
      await this.drizzle.db.insert(societyRoles).values({
        userId: user.id,
        societyId,
        role: body.role as 'GUARD' | 'GUARD_SUPERVISOR' | 'SOCIETY_ADMIN',
        active: true,
        gateId: isGuardRole ? body.gateId || null : null,
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

  @Get('users')
  @RequirePermission('member.manage', ScopeType.SOCIETY)
  async listUsers(@Param('societyId') societyId: string) {
    const residentRows = await this.drizzle.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: unitMemberships.role,
        unitId: units.id,
        unitNumber: units.unitNumber,
        buildingId: units.buildingId,
        buildingName: buildings.name,
        isPrimary: unitMemberships.isPrimary,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(unitMemberships)
      .innerJoin(units, eq(unitMemberships.unitId, units.id))
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .innerJoin(users, eq(unitMemberships.userId, users.id))
      .where(eq(units.societyId, societyId));

    const societyRoleRows = await this.drizzle.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: societyRoles.role,
        gateId: societyRoles.gateId,
        gateName: gates.name,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(societyRoles)
      .innerJoin(users, eq(societyRoles.userId, users.id))
      .leftJoin(gates, eq(societyRoles.gateId, gates.id))
      .where(
        and(
          eq(societyRoles.societyId, societyId),
          eq(societyRoles.active, true),
        ),
      );

    return [...residentRows, ...societyRoleRows];
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

  @Get('buildings')
  @RequirePermission('unit.manage', ScopeType.SOCIETY)
  async listBuildings(@Param('societyId') societyId: string) {
    return this.drizzle.db
      .select()
      .from(buildings)
      .where(eq(buildings.societyId, societyId));
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

  /**
   * Assign/unassign/list a unit's staff use `targetUnitId` rather than `unitId` as the
   * route param name on purpose: RbacScopeGuard resolves its RLS/permission scope target
   * from `request.params.unitId` before `request.params.societyId` (see its param
   * priority list), which would misroute these SOCIETY-scoped admin routes onto a
   * UNIT-scope lookup if the param were literally named `unitId`.
   */
  @Get('units/:targetUnitId/staff')
  @RequirePermission('staff.manage', ScopeType.SOCIETY)
  async listUnitStaff(
    @Param('societyId') societyId: string,
    @Param('targetUnitId') targetUnitId: string,
  ) {
    await this.assertUnitInSociety(societyId, targetUnitId);
    return this.staffService.listStaffByUnit(targetUnitId);
  }

  @Post('staff/:staffId/units/:targetUnitId')
  @RequirePermission('staff.assign', ScopeType.SOCIETY)
  async assignStaffToUnit(
    @Param('societyId') societyId: string,
    @Param('staffId') staffId: string,
    @Param('targetUnitId') targetUnitId: string,
    @Body() body: { notify?: boolean },
  ) {
    await this.assertUnitInSociety(societyId, targetUnitId);
    return this.staffService.assignStaffToUnit(staffId, targetUnitId, body?.notify ?? true);
  }

  @Delete('staff/:staffId/units/:targetUnitId')
  @RequirePermission('staff.assign', ScopeType.SOCIETY)
  async unassignStaffFromUnit(
    @Param('societyId') societyId: string,
    @Param('staffId') staffId: string,
    @Param('targetUnitId') targetUnitId: string,
  ) {
    await this.assertUnitInSociety(societyId, targetUnitId);
    return this.staffService.unassignStaffFromUnit(staffId, targetUnitId);
  }

  private async assertUnitInSociety(societyId: string, unitId: string) {
    const [unit] = await this.drizzle.db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.societyId, societyId)))
      .limit(1);

    if (!unit) {
      throw new NotFoundException(`Unit ${unitId} not found in society ${societyId}`);
    }
  }

  @Get('notices')
  @RequirePermission('notice.post', ScopeType.SOCIETY)
  async listNotices(@Param('societyId') societyId: string) {
    return this.noticesService.listBySociety(societyId);
  }

  @Post('notices')
  @RequirePermission('notice.post', ScopeType.SOCIETY)
  async createNotice(
    @Param('societyId') societyId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreateNoticeDto,
  ) {
    if (!body.title?.trim() || !body.body?.trim()) {
      throw new BadRequestException('title and body are required');
    }

    const [author] = await this.drizzle.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return this.noticesService.create(societyId, body, {
      userId,
      name: author?.name || 'Society Admin',
      role: 'SOCIETY_ADMIN',
    });
  }

  @Patch('notices/:id/pin')
  @RequirePermission('notice.post', ScopeType.SOCIETY)
  async toggleNoticePin(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.noticesService.togglePin(societyId, id);
  }

  @Delete('notices/:id')
  @RequirePermission('notice.post', ScopeType.SOCIETY)
  async deleteNotice(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.noticesService.delete(societyId, id);
  }

  @Get('complaints')
  @RequirePermission('complaint.manage', ScopeType.SOCIETY)
  async listComplaints(@Param('societyId') societyId: string) {
    return this.complaintsService.listBySociety(societyId);
  }

  @Patch('complaints/:id')
  @RequirePermission('complaint.manage', ScopeType.SOCIETY)
  async updateComplaint(
    @Param('societyId') societyId: string,
    @Param('id') id: string,
    @Body() body: UpdateComplaintStatusDto,
  ) {
    if (!body.status) {
      throw new BadRequestException('status is required');
    }
    return this.complaintsService.updateStatus(societyId, id, body);
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
      .leftJoin(gates, eq(devices.gateId, gates.id))
      .where(eq(devices.societyId, societyId));
  }

  @Get('gates')
  @RequirePermission('gate.manage', ScopeType.SOCIETY)
  async listGates(@Param('societyId') societyId: string) {
    return this.gatesService.listBySociety(societyId);
  }

  @Post('gates')
  @RequirePermission('gate.manage', ScopeType.SOCIETY)
  async createGate(@Param('societyId') societyId: string, @Body() body: CreateGateDto) {
    if (!body.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    return this.gatesService.create(societyId, body);
  }

  @Patch('gates/:id')
  @RequirePermission('gate.manage', ScopeType.SOCIETY)
  async updateGate(
    @Param('societyId') societyId: string,
    @Param('id') id: string,
    @Body() body: UpdateGateDto,
  ) {
    return this.gatesService.update(societyId, id, body);
  }

  @Delete('gates/:id')
  @RequirePermission('gate.manage', ScopeType.SOCIETY)
  async deleteGate(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.gatesService.delete(societyId, id);
  }

  /**
   * Assign (or, with `gateId: null`, unassign back to unrestricted) a guard/supervisor
   * to a specific gate. `targetUserId` rather than `userId` on purpose — same
   * RbacScopeGuard param-priority reasoning as `staff/:staffId/units/:targetUnitId`
   * above, so this SOCIETY-scoped route doesn't get accidentally misrouted.
   */
  @Patch('guards/:targetUserId/gate')
  @RequirePermission('gate.manage', ScopeType.SOCIETY)
  async assignGuardGate(
    @Param('societyId') societyId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() body: AssignGuardGateDto,
  ) {
    return this.gatesService.assignGuardToGate(societyId, targetUserId, body?.gateId ?? null);
  }
}
