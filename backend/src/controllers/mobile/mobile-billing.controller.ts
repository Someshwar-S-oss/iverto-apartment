import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { eq } from 'drizzle-orm';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../modules/auth/guards/password-change.guard';
import { RbacScopeGuard } from '../../modules/rbac/guards/rbac-scope.guard';
import { RequirePermission } from '../../modules/rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../../modules/rbac/decorators/current-user.decorator';
import { ScopeType } from '../../modules/rbac/rbac.constants';
import { DrizzleService } from '../../database/drizzle.service';
import { units } from '../../database/schema';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { InvoicesService } from '../../modules/billing/invoices.service';
import { PaymentsService, RazorpayVerifyDto } from '../../modules/billing/payments.service';
import { BillingReportsService } from '../../modules/billing/billing-reports.service';

@ApiTags('Mobile - Billing')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/mobile/units/:unitId/billing')
@UseGuards(JwtAuthGuard, PasswordChangeGuard, RbacScopeGuard)
export class MobileBillingController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly billingReportsService: BillingReportsService,
  ) {}

  /** Mirrors MobileResidentController's identical helper — this controller has its own
   * guard chain and doesn't share that one's DI graph. */
  private async resolveSocietyId(unitId: string): Promise<string> {
    const [unit] = await this.drizzle.db
      .select({ societyId: units.societyId })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!unit) throw new NotFoundException(`Unit ${unitId} not found`);
    return unit.societyId;
  }

  @Get('invoices')
  @RequirePermission('billing.view', ScopeType.UNIT)
  async listMyInvoices(@Param('unitId') unitId: string) {
    const societyId = await this.resolveSocietyId(unitId);
    return this.invoicesService.listForUnit(societyId, unitId);
  }

  @Get('invoices/:id')
  @RequirePermission('billing.view', ScopeType.UNIT)
  async getInvoice(@Param('unitId') unitId: string, @Param('id') id: string) {
    const societyId = await this.resolveSocietyId(unitId);
    const invoice = await this.invoicesService.getDetail(societyId, id);
    if (invoice.unitId !== unitId) {
      throw new NotFoundException(`Invoice ${id} not found for this unit`);
    }
    return invoice;
  }

  @Get('invoices/:id/receipt')
  @RequirePermission('billing.view', ScopeType.UNIT)
  async getInvoiceReceipt(
    @Param('unitId') unitId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const societyId = await this.resolveSocietyId(unitId);
    const invoice = await this.invoicesService.getDetail(societyId, id);
    if (invoice.unitId !== unitId) {
      throw new NotFoundException(`Invoice ${id} not found for this unit`);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`);
    await this.billingReportsService.streamInvoiceReceiptPdf(societyId, id, res);
  }

  @Post('invoices/:id/pay/order')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('billing.pay', ScopeType.UNIT)
  async createPaymentOrder(
    @Param('unitId') unitId: string,
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    const societyId = await this.resolveSocietyId(unitId);
    return this.paymentsService.createOrder(societyId, unitId, id, userId);
  }

  @Post('invoices/:id/pay/verify')
  @UseInterceptors(IdempotencyInterceptor)
  @RequirePermission('billing.pay', ScopeType.UNIT)
  async verifyPayment(
    @Param('unitId') unitId: string,
    @Param('id') id: string,
    @Body() body: RazorpayVerifyDto,
  ) {
    const societyId = await this.resolveSocietyId(unitId);
    return this.paymentsService.confirmPayment(societyId, unitId, id, body);
  }
}
