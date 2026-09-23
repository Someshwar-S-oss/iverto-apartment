import { BadRequestException, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
// See payments.service.ts for why this is require()'d rather than imported.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');
import { DrizzleService } from '../../database/drizzle.service';
import { PaymentsService } from '../../modules/billing/payments.service';

/**
 * Server-to-server callback from Razorpay — deliberately outside the JwtAuthGuard/
 * RbacScopeGuard chain every other controller uses, since Razorpay is not an
 * authenticated user of this app. Trust is established entirely by the HMAC signature
 * check below, not by any guard. No `request.rlsContext` gets set here (no RbacScopeGuard
 * ran), so RlsContextInterceptor no-ops for this route — the handler must open its own
 * system-context transaction via drizzle.withSystemContext, matching billing-scheduler's
 * background-job pattern.
 */
@ApiExcludeController()
@Controller('api/v1/webhooks/razorpay')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  async handleWebhook(@Req() req: Request, @Headers('x-razorpay-signature') signature: string) {
    const secret = this.config.get<string>('razorpay.webhookSecret') || '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});

    if (!secret) {
      this.logger.warn('Received Razorpay webhook but RAZORPAY_WEBHOOK_SECRET is not configured — ignoring');
      throw new BadRequestException('Webhook not configured');
    }

    const valid = Razorpay.validateWebhookSignature(rawBody, signature || '', secret);
    if (!valid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody);

    return this.drizzle.withSystemContext(() => this.paymentsService.handleWebhookEvent(event));
  }
}
