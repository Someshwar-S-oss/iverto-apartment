import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Res,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { eq, or, and } from 'drizzle-orm';
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

@Controller('api/v1/mobile/gates/:gateId')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class MobileGuardController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly entryEventsService: EntryEventsService,
    private readonly approvalsService: ApprovalsService,
    private readonly visitorImagesService: VisitorImagesService,
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
  @RequirePermission('directory.read', ScopeType.GATE)
  async getDirectory(
    @Param('gateId') gateId: string,
    @Query('query') searchQuery?: string,
  ) {
    const societyId = await this.getSocietyIdForGate(gateId);

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
      .leftJoin(unitMemberships, eq(units.id, unitMemberships.unitId))
      .leftJoin(users, eq(unitMemberships.userId, users.id))
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
  @RequirePermission('passcode.verify', ScopeType.GATE)
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

  @Post('entry-events/:id/exit')
  @RequirePermission('entry.create', ScopeType.GATE)
  async markExit(
    @Param('gateId') _gateId: string,
    @Param('id') entryEventId: string,
    @CurrentUser('sub') guardUserId: string,
  ) {
    return this.entryEventsService.markExit(entryEventId, guardUserId);
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
  constructor(private readonly visitorImagesService: VisitorImagesService) {}

  @Get(':id/photo')
  async streamVisitorPhoto(
    @Param('id') entryEventId: string,
    @Res() res: Response,
  ) {
    const image = await this.visitorImagesService.getImage(entryEventId);

    res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
    if (image.sizeBytes) {
      res.setHeader('Content-Length', image.sizeBytes.toString());
    }

    res.end(image.imageBytes);
  }
}
