import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { DrizzleService } from '../../database/drizzle.service';
import { passcodes, deliveryPermissions } from '../../database/schema';
import { ApprovalsService } from '../../modules/approvals/approvals.service';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { StaffService } from '../../modules/staff/staff.service';

export interface DecideApprovalDto {
  decision: 'APPROVED' | 'REJECTED';
}

export interface AssignStaffDto {
  staffId: string;
  notify?: boolean;
}

export interface CreatePasscodeDto {
  code?: string;
  validFrom?: string | Date;
  validUntil: string | Date;
  maxUses?: number;
}

export interface UpdateDeliveryPermissionDto {
  mode: 'ASK_ME' | 'LEAVE_AT_GATE' | 'ALLOW_TO_DOOR';
  windowStart?: string;
  windowEnd?: string;
  silent?: boolean;
}

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Mobile - Resident')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/mobile/units/:unitId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class MobileResidentController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly approvalsService: ApprovalsService,
    private readonly entryEventsService: EntryEventsService,
    private readonly staffService: StaffService,
  ) {}

  @Get('pending')
  @RequirePermission('approval.decide', ScopeType.UNIT)
  async getPendingApprovals(@Param('unitId') unitId: string) {
    return this.approvalsService.listPendingByUnit(unitId);
  }

  @Post('approvals/:id/decide')
  @RequirePermission('approval.decide', ScopeType.UNIT)
  async decideApproval(
    @Param('unitId') _unitId: string,
    @Param('id') approvalId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: DecideApprovalDto,
  ) {
    if (!body.decision || !['APPROVED', 'REJECTED'].includes(body.decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    return this.approvalsService.decideApproval(approvalId, userId, body.decision);
  }

  @Get('entry-events')
  @RequirePermission('entry.view', ScopeType.UNIT)
  async getEntryEvents(
    @Param('unitId') unitId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.entryEventsService.listUnitEntryEvents(
      unitId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
    );
  }

  @Get('staff')
  @RequirePermission('entry.view', ScopeType.UNIT)
  async getStaff(@Param('unitId') unitId: string) {
    return this.staffService.listStaffByUnit(unitId);
  }

  @Post('staff')
  @RequirePermission('staff.assign', ScopeType.UNIT)
  async assignStaff(
    @Param('unitId') unitId: string,
    @Body() body: AssignStaffDto,
  ) {
    if (!body.staffId) {
      throw new BadRequestException('staffId is required');
    }
    return this.staffService.assignStaffToUnit(body.staffId, unitId, body.notify ?? true);
  }

  @Delete('staff/:staffId')
  @RequirePermission('staff.assign', ScopeType.UNIT)
  async unassignStaff(
    @Param('unitId') unitId: string,
    @Param('staffId') staffId: string,
  ) {
    return this.staffService.unassignStaffFromUnit(staffId, unitId);
  }

  @Post('passcodes')
  @RequirePermission('passcode.create', ScopeType.UNIT)
  async createPasscode(
    @Param('unitId') unitId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreatePasscodeDto,
  ) {
    if (!body.validUntil) {
      throw new BadRequestException('validUntil is required');
    }

    const code =
      body.code?.trim() ||
      Math.floor(100000 + Math.random() * 900000).toString();

    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    const validUntil = new Date(body.validUntil);

    const [passcode] = await this.drizzle.db
      .insert(passcodes)
      .values({
        unitId,
        createdByUserId: userId,
        code,
        validFrom,
        validUntil,
        maxUses: body.maxUses || 1,
        usesCount: 0,
        revoked: false,
      })
      .returning();

    return passcode;
  }

  @Get('passcodes')
  @RequirePermission('passcode.create', ScopeType.UNIT)
  async listPasscodes(@Param('unitId') unitId: string) {
    return this.drizzle.db
      .select()
      .from(passcodes)
      .where(eq(passcodes.unitId, unitId))
      .orderBy(desc(passcodes.createdAt));
  }

  @Delete('passcodes/:id')
  @RequirePermission('passcode.create', ScopeType.UNIT)
  async revokePasscode(
    @Param('unitId') unitId: string,
    @Param('id') id: string,
  ) {
    const [revoked] = await this.drizzle.db
      .update(passcodes)
      .set({ revoked: true })
      .where(and(eq(passcodes.id, id), eq(passcodes.unitId, unitId)))
      .returning();

    if (!revoked) {
      throw new NotFoundException(`Passcode ${id} not found for this unit`);
    }

    return revoked;
  }

  @Get('delivery-permissions')
  @RequirePermission('delivery_perm.edit', ScopeType.UNIT)
  async getDeliveryPermissions(@Param('unitId') unitId: string) {
    return this.drizzle.db
      .select()
      .from(deliveryPermissions)
      .where(eq(deliveryPermissions.unitId, unitId));
  }

  @Put('delivery-permissions/:platform')
  @RequirePermission('delivery_perm.edit', ScopeType.UNIT)
  async updateDeliveryPermission(
    @Param('unitId') unitId: string,
    @Param('platform') platform: any,
    @Body() body: UpdateDeliveryPermissionDto,
  ) {
    if (!body.mode || !['ASK_ME', 'LEAVE_AT_GATE', 'ALLOW_TO_DOOR'].includes(body.mode)) {
      throw new BadRequestException('Valid mode is required (ASK_ME, LEAVE_AT_GATE, ALLOW_TO_DOOR)');
    }

    const [existing] = await this.drizzle.db
      .select()
      .from(deliveryPermissions)
      .where(
        and(
          eq(deliveryPermissions.unitId, unitId),
          eq(deliveryPermissions.platform, platform),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.drizzle.db
        .update(deliveryPermissions)
        .set({
          mode: body.mode,
          windowStart: body.windowStart ?? null,
          windowEnd: body.windowEnd ?? null,
          silent: body.silent ?? false,
          updatedAt: new Date(),
        })
        .where(eq(deliveryPermissions.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.drizzle.db
      .insert(deliveryPermissions)
      .values({
        unitId,
        platform,
        mode: body.mode,
        windowStart: body.windowStart ?? null,
        windowEnd: body.windowEnd ?? null,
        silent: body.silent ?? false,
      })
      .returning();

    return created;
  }
}
