import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  Res,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { eq, or, and, isNull, gt } from 'drizzle-orm';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { DrizzleService } from '../../database/drizzle.service';
import { devices, units, buildings, unitMemberships, users } from '../../database/schema';
import { EntryEventsService } from '../../modules/entry-events/entry-events.service';
import { ApprovalsService } from '../../modules/approvals/approvals.service';
import { VisitorImagesService } from '../../modules/media/visitor-images.service';
import { StaffService } from '../../modules/staff/staff.service';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';

export interface CreateGuardEntryBody {
  unitId?: string;
  visitorName?: string;
  visitorPhone?: string;
  subjectType: 'STAFF' | 'VISITOR' | 'DELIVERY' | 'RESIDENT';
  photoBase64?: string;
  mimeType?: string;
  platform?:
    | 'BLINKIT'
    | 'ZEPTO'
    | 'SWIGGY'
    | 'INSTAMART'
    | 'AMAZON'
    | 'FLIPKART'
    | 'OTHER';
  staffId?: string;
}

export interface VerifyPasscodeBody {
  codeOrQrToken: string;
  photoBase64?: string;
  mimeType?: string;
}

import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Mobile - Guard')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/mobile/gates/:gateId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class MobileGuardController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly entryEventsService: EntryEventsService,
    private readonly approvalsService: ApprovalsService,
    private readonly visitorImagesService: VisitorImagesService,
    private readonly staffService: StaffService,
  ) {}

  private async getSocietyIdForGate(gateId: string): Promise<string> {
    const [device] = await this.drizzle.db
      .select({ societyId: devices.societyId })
      .from(devices)
      .where(or(eq(devices.gateId, gateId), eq(devices.id, gateId)))
      .limit(1);

    if (device) {
      return device.societyId;
    }

    // If gateId is itself a society ID or unmapped gate, fallback to gateId
    return gateId;
  }

  @Get('directory')
  // SOCIETY, not GATE: a directory is society-wide data — the same rows behind every
  // barrier — per gate-management-architecture.md §4.1 and rbac.constants.ts's grant
  // table. assertPermission's SOCIETY branch resolves this route's gateId param to its
  // owning society via the same device/gate lookup the GATE branch uses.
  @RequirePermission('directory.read', ScopeType.SOCIETY)
  async getDirectory(
    @Param('gateId') gateId: string,
    @Query('query') searchQuery?: string,
  ) {
    const societyId = await this.getSocietyIdForGate(gateId);
    const now = new Date();

    const rows = await this.drizzle.db
      .select({
        unitId: units.id,
        unitNumber: units.unitNumber,
        buildingId: units.buildingId,
        buildingName: buildings.name,
        societyId: units.societyId,
        userId: users.id,
        userName: users.name,
        userPhone: users.phone,
        userRole: unitMemberships.role,
      })
      .from(units)
      .leftJoin(buildings, eq(units.buildingId, buildings.id))
      .leftJoin(
        unitMemberships,
        and(
          eq(units.id, unitMemberships.unitId),
          or(isNull(unitMemberships.activeTo), gt(unitMemberships.activeTo, now)),
        ),
      )
      .leftJoin(
        users,
        and(
          eq(unitMemberships.userId, users.id),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .where(eq(units.societyId, societyId));

    // Group by unit
    const unitMap = new Map<string, any>();
    for (const r of rows) {
      if (!unitMap.has(r.unitId)) {
        unitMap.set(r.unitId, {
          unitId: r.unitId,
          unitNumber: r.unitNumber,
          buildingId: r.buildingId,
          buildingName: r.buildingName,
          residents: [],
        });
      }

      if (r.userId && r.userName) {
        unitMap.get(r.unitId).residents.push({
          id: r.userId,
          name: r.userName,
          phone: r.userPhone,
          role: r.userRole,
        });
      }
    }

    let results = Array.from(unitMap.values());
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      results = results.filter(
        (u) =>
          u.unitNumber?.toLowerCase().includes(q) ||
          u.buildingName?.toLowerCase().includes(q) ||
          u.residents.some((res: any) =>
            res.name?.toLowerCase().includes(q) || res.phone?.includes(q),
          ),
      );
    }

    return results;
  }

  @Post('entry-events')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('entry.create', ScopeType.GATE)
  async createEntry(
    @Param('gateId') gateId: string,
    @CurrentUser('sub') guardUserId: string,
    @Body() body: CreateGuardEntryBody,
  ) {
    if (!body.subjectType) {
      throw new BadRequestException('subjectType is required');
    }

    const societyId = await this.getSocietyIdForGate(gateId);

    let photoBuffer: Buffer | undefined;
    if (body.photoBase64) {
      const base64Data = body.photoBase64.replace(/^data:image\/\w+;base64,/, '');
      photoBuffer = Buffer.from(base64Data, 'base64');
    }

    return this.entryEventsService.createGuardEntry(
      societyId,
      gateId,
      guardUserId,
      {
        unitId: body.unitId,
        visitorName: body.visitorName,
        visitorPhone: body.visitorPhone,
        subjectType: body.subjectType,
        photoBuffer,
        mimeType: body.mimeType || 'image/jpeg',
        platform: body.platform,
        staffId: body.staffId,
      },
    );
  }

  @Post('passcodes/verify')
  @HttpCode(200) // a verdict, not a creation — 200 for both {verified: true} and {verified: false, reason}
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('passcode.verify', ScopeType.GATE)
  // A 6-digit code has only 1e6 combinations; without a tight throttle here it's
  // brute-forceable well before maxUses/expiry would stop an attacker.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async verifyPasscode(
    @Param('gateId') gateId: string,
    @CurrentUser('sub') guardUserId: string,
    @Body() body: VerifyPasscodeBody,
  ) {
    if (!body.codeOrQrToken) {
      throw new BadRequestException('codeOrQrToken is required');
    }

    const societyId = await this.getSocietyIdForGate(gateId);

    let photoBuffer: Buffer | undefined;
    if (body.photoBase64) {
      const base64Data = body.photoBase64.replace(/^data:image\/\w+;base64,/, '');
      photoBuffer = Buffer.from(base64Data, 'base64');
    }

    return this.entryEventsService.verifyPasscode(
      societyId,
      gateId,
      guardUserId,
      body.codeOrQrToken,
      photoBuffer,
    );
  }

  @Get('entry-events')
  @RequirePermission('entry.view', ScopeType.GATE)
  async getGateEntryEvents(
    @Param('gateId') gateId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('open') open?: string,
  ) {
    return this.entryEventsService.listGateEntryEvents(
      gateId,
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
      open === 'true',
    );
  }

  @Post('entry-events/:id/exit')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('entry.create', ScopeType.GATE)
  async markExit(
    @Param('gateId') gateId: string,
    @Param('id') entryEventId: string,
    @CurrentUser('sub') guardUserId: string,
  ) {
    const societyId = await this.getSocietyIdForGate(gateId);
    return this.entryEventsService.markExit(entryEventId, societyId, guardUserId);
  }

  @Get('staff')
  @RequirePermission('directory.read', ScopeType.SOCIETY)
  async getSocietyStaff(
    @Param('gateId') gateId: string,
    @Query('status') status?: 'ACTIVE' | 'INACTIVE',
  ) {
    const societyId = await this.getSocietyIdForGate(gateId);
    return this.staffService.listStaffBySociety(societyId, status || 'ACTIVE');
  }

  @Get('pending')
  @RequirePermission('entry.view', ScopeType.GATE)
  async getPendingApprovals(@Param('gateId') gateId: string) {
    return this.approvalsService.listPendingByGate(gateId);
  }
}

@Controller('api/v1/mobile/entry-events')
@UseGuards(JwtAuthGuard, PasswordChangeGuard)
export class MobileEntryEventsController {
  constructor(private readonly entryEventsService: EntryEventsService) {}

  @Get(':id/photo')
  async streamVisitorPhoto(
    @Param('id') entryEventId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    // Authorization is resolved from the entry event's own unit/gate/society tenancy,
    // since this route (deliberately) has no unitId/societyId/gateId in its URL for
    // RbacScopeGuard to key off — see EntryEventsService.getVisitorPhotoForUser.
    const image = await this.entryEventsService.getVisitorPhotoForUser(entryEventId, user);

    res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
    if (image.sizeBytes) {
      res.setHeader('Content-Length', image.sizeBytes.toString());
    }

    res.end(image.imageBytes);
  }
}
