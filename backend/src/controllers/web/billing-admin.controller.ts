import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { societies } from '../../database/schema';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import {
  BillingPlansService,
  CreateBillingPlanDto,
  UpdateBillingPlanDto,
  UpdateBillingSettingsDto,
} from '../../modules/billing/billing-plans.service';
import { ChargeTypesService, CreateChargeTypeDto } from '../../modules/billing/charge-types.service';
import { ChargesService, CreateAdhocChargeDto } from '../../modules/billing/charges.service';
import { InvoicesService } from '../../modules/billing/invoices.service';
import { PaymentsService } from '../../modules/billing/payments.service';
import { BillingReportsService } from '../../modules/billing/billing-reports.service';

export interface AssignUnitsDto {
  unitIds: string[];
}

export interface RecordManualPaymentDto {
  amount: number;
  method: 'MANUAL' | 'OFFLINE';
  note?: string;
  payerUserId?: string;
  payerRole?: 'OWNER' | 'TENANT';
}

@ApiTags('Web - Billing')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/web/societies/:societyId/billing')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class BillingAdminController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly billingPlansService: BillingPlansService,
    private readonly chargeTypesService: ChargeTypesService,
    private readonly chargesService: ChargesService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly billingReportsService: BillingReportsService,
  ) {}

  @Get('dashboard')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async getDashboard(@Param('societyId') societyId: string) {
    return this.billingReportsService.getDashboardSummary(societyId);
  }

  @Get('settings')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async getSettings(@Param('societyId') societyId: string) {
    return this.billingPlansService.getSettings(societyId);
  }

  @Patch('settings')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async updateSettings(@Param('societyId') societyId: string, @Body() body: UpdateBillingSettingsDto) {
    return this.billingPlansService.updateSettings(societyId, body);
  }

  @Get('plans')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async listPlans(@Param('societyId') societyId: string) {
    return this.billingPlansService.list(societyId);
  }

  @Post('plans')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async createPlan(@Param('societyId') societyId: string, @Body() body: CreateBillingPlanDto) {
    return this.billingPlansService.create(societyId, body);
  }

  @Patch('plans/:id')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async updatePlan(
    @Param('societyId') societyId: string,
    @Param('id') id: string,
    @Body() body: UpdateBillingPlanDto,
  ) {
    return this.billingPlansService.update(societyId, id, body);
  }

  @Post('plans/:id/assign-units')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async assignUnits(
    @Param('societyId') societyId: string,
    @Param('id') id: string,
    @Body() body: AssignUnitsDto,
  ) {
    return this.billingPlansService.assignUnits(societyId, id, body.unitIds);
  }

  @Get('unit-assignments')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async listUnitAssignments(@Param('societyId') societyId: string) {
    return this.billingPlansService.listUnitAssignments(societyId);
  }

  // Route param deliberately spelled targetUnitId, not unitId — RbacScopeGuard's
  // targetScopeId resolution checks params.unitId before params.societyId (see its doc
  // comment), so a literal :unitId here would hijack this SOCIETY-scoped permission
  // check into a (failing) UNIT-scoped one. Same convention SocietyAdminController uses
  // for staff/:staffId/units/:targetUnitId.
  @Delete('units/:targetUnitId/plan')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async unassignUnit(@Param('societyId') societyId: string, @Param('targetUnitId') targetUnitId: string) {
    return this.billingPlansService.unassignUnit(societyId, targetUnitId);
  }

  @Get('charge-types')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async listChargeTypes(@Param('societyId') societyId: string) {
    return this.chargeTypesService.list(societyId);
  }

  @Post('charge-types')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async createChargeType(@Param('societyId') societyId: string, @Body() body: CreateChargeTypeDto) {
    return this.chargeTypesService.create(societyId, body);
  }

  @Delete('charge-types/:id')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async deleteChargeType(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.chargeTypesService.delete(societyId, id);
  }

  @Get('charges')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async listCharges(
    @Param('societyId') societyId: string,
    @Query('unitId') unitId?: string,
    @Query('status') status?: string,
  ) {
    return this.chargesService.list(societyId, { unitId, status });
  }

  @Post('charges')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async createCharge(
    @Param('societyId') societyId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: CreateAdhocChargeDto,
  ) {
    return this.chargesService.create(societyId, userId, body);
  }

  @Post('charges/:id/cancel')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async cancelCharge(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.chargesService.cancel(societyId, id);
  }

  @Get('invoices')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async listInvoices(
    @Param('societyId') societyId: string,
    @Query('unitId') unitId?: string,
    @Query('status') status?: string,
    @Query('cycleId') cycleId?: string,
  ) {
    return this.invoicesService.listForSociety(societyId, { unitId, status, cycleId });
  }

  @Get('invoices/:id')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async getInvoice(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.invoicesService.getDetail(societyId, id);
  }

  @Post('invoices/:id/void')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async voidInvoice(@Param('societyId') societyId: string, @Param('id') id: string) {
    return this.invoicesService.voidInvoice(societyId, id);
  }

  @Post('invoices/:id/manual-payment')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async recordManualPayment(
    @Param('societyId') societyId: string,
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() body: RecordManualPaymentDto,
  ) {
    if (!body.method || !['MANUAL', 'OFFLINE'].includes(body.method)) {
      throw new BadRequestException('method must be MANUAL or OFFLINE');
    }
    return this.paymentsService.recordManualPayment(societyId, id, body, userId);
  }

  @Post('generate')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async generateBills(@Param('societyId') societyId: string) {
    return this.invoicesService.generateForSociety(societyId);
  }

  @Get('reports/export')
  @RequirePermission('billing.manage', ScopeType.SOCIETY)
  async exportReport(
    @Param('societyId') societyId: string,
    @Res() res: Response,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Query('cycleId') cycleId?: string,
  ) {
    const rows = await this.billingReportsService.getLedger(societyId, { cycleId });

    if (format === 'pdf') {
      const [society] = await this.drizzle.db
        .select({ name: societies.name })
        .from(societies)
        .where(eq(societies.id, societyId))
        .limit(1);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="billing-ledger.pdf"');
      this.billingReportsService.streamPdf(rows, society?.name || 'Society', res);
      return;
    }

    const csv = this.billingReportsService.toCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="billing-ledger.csv"');
    res.send(csv);
  }
}
