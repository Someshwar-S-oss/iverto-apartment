import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { InvoicesService } from './invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { invoices, payments } from '../../database/schema';

// razorpay ships as a CommonJS `export =`; `import Razorpay from 'razorpay'` needs
// esModuleInterop, which this repo's tsconfig doesn't set — require() avoids relying on it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');

export interface RazorpayVerifyDto {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Razorpay order creation + signature verification, plus manual/offline payment recording
 * for cash/cheque collected outside the gateway. Every method here works whether or not
 * real Razorpay keys are configured — only createOrder actually needs them, and fails with
 * a clear message rather than crashing when they're blank (see RAZORPAY_KEY_ID's comment
 * in .env.example).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    private readonly invoicesService: InvoicesService,
    private readonly notifications: NotificationsService,
  ) {}

  private isConfigured(): boolean {
    return Boolean(this.config.get<string>('razorpay.keyId') && this.config.get<string>('razorpay.keySecret'));
  }

  private getClient() {
    return new Razorpay({
      key_id: this.config.get<string>('razorpay.keyId'),
      key_secret: this.config.get<string>('razorpay.keySecret'),
    });
  }

  /** Pure HMAC check — separated out so it's testable without an SDK instance or DB. */
  static verifySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signature || '', 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  async createOrder(societyId: string, unitId: string, invoiceId: string, userId: string) {
    const [invoice] = await this.drizzle.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.societyId, societyId), eq(invoices.unitId, unitId)))
      .limit(1);
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
      throw new BadRequestException(`Invoice is already ${invoice.status.toLowerCase()}`);
    }

    const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
    if (outstanding <= 0) throw new BadRequestException('Nothing outstanding on this invoice');

    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payment gateway not configured. Add RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET (free test-mode keys) to enable online payments.',
      );
    }

    const amountPaise = Math.round(outstanding * 100);
    const client = this.getClient();
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: invoice.invoiceNumber,
      notes: { invoiceId, unitId, societyId },
    });

    await this.drizzle.db.insert(payments).values({
      societyId,
      invoiceId,
      unitId,
      amount: outstanding,
      method: 'RAZORPAY',
      status: 'CREATED',
      razorpayOrderId: order.id,
      rawResponse: order,
      paidByUserId: userId,
    });

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: this.config.get<string>('razorpay.keyId'),
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  async confirmPayment(societyId: string, unitId: string, invoiceId: string, dto: RazorpayVerifyDto) {
    if (!dto.razorpay_order_id || !dto.razorpay_payment_id || !dto.razorpay_signature) {
      throw new BadRequestException('razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
    }

    const [payment] = await this.drizzle.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.razorpayOrderId, dto.razorpay_order_id),
          eq(payments.invoiceId, invoiceId),
          eq(payments.unitId, unitId),
          eq(payments.societyId, societyId),
        ),
      )
      .limit(1);
    if (!payment) throw new NotFoundException('No matching payment order found for this invoice');

    if (payment.status === 'SUCCESS') {
      // Already confirmed (e.g. by the webhook racing ahead of the client callback) —
      // idempotent no-op rather than double-applying the payment.
      return this.invoicesService.getDetail(societyId, invoiceId);
    }

    const secret = this.config.get<string>('razorpay.keySecret') || '';
    const valid = PaymentsService.verifySignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
      secret,
    );

    if (!valid) {
      await this.drizzle.db
        .update(payments)
        .set({ status: 'FAILED' })
        .where(eq(payments.id, payment.id));
      throw new BadRequestException('Payment signature verification failed');
    }

    await this.drizzle.db
      .update(payments)
      .set({
        status: 'SUCCESS',
        razorpayPaymentId: dto.razorpay_payment_id,
        razorpaySignature: dto.razorpay_signature,
        paidAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await this.invoicesService.applyPayment(invoiceId, Number(payment.amount));

    await this.notifications.sendNotificationToUnit(
      unitId,
      'PAYMENT_CONFIRMED',
      'Payment received',
      `We've received your payment of ₹${payment.amount}. Thank you!`,
      { invoiceId },
    );

    return this.invoicesService.getDetail(societyId, invoiceId);
  }

  async recordManualPayment(
    societyId: string,
    invoiceId: string,
    dto: {
      amount: number;
      method: 'MANUAL' | 'OFFLINE';
      note?: string;
      payerUserId?: string;
      payerRole?: 'OWNER' | 'TENANT';
    },
    adminUserId: string,
  ) {
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');

    const [invoice] = await this.drizzle.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.societyId, societyId)))
      .limit(1);
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
    if (dto.amount > outstanding) {
      throw new BadRequestException(`Amount exceeds the outstanding balance of ₹${outstanding}`);
    }

    await this.drizzle.db.insert(payments).values({
      societyId,
      invoiceId,
      unitId: invoice.unitId,
      amount: dto.amount,
      method: dto.method,
      status: 'SUCCESS',
      rawResponse: {
        note: dto.note,
        payerRole: dto.payerRole,
        recordedByAdmin: adminUserId,
      },
      paidByUserId: dto.payerUserId ? dto.payerUserId : adminUserId,
      paidAt: new Date(),
    });

    const updatedInvoice = await this.invoicesService.applyPayment(invoiceId, dto.amount);

    await this.notifications.sendNotificationToUnit(
      invoice.unitId,
      'PAYMENT_CONFIRMED',
      'Payment recorded',
      `A payment of ₹${dto.amount} has been recorded against invoice ${invoice.invoiceNumber}.`,
      { invoiceId },
    );

    return updatedInvoice;
  }

  /**
   * Server-to-server reconciliation for Razorpay's webhook (payment.captured/order.paid) —
   * defensive against the client closing the browser before the confirm call fires.
   * Runs with no authenticated request/RLS context, so the caller (BillingWebhookController)
   * must wrap this in drizzle.withSystemContext.
   */
  async handleWebhookEvent(event: any) {
    const entity = event?.payload?.payment?.entity;
    if (!entity) return { handled: false };

    const orderId = entity.order_id;
    const paymentId = entity.id;
    if (!orderId || !paymentId) return { handled: false };

    const [payment] = await this.drizzle.db.select().from(payments).where(eq(payments.razorpayOrderId, orderId)).limit(1);
    if (!payment) {
      this.logger.warn(`Webhook for unknown order ${orderId}`);
      return { handled: false };
    }
    if (payment.status === 'SUCCESS') {
      return { handled: true, alreadyProcessed: true };
    }

    await this.drizzle.db
      .update(payments)
      .set({
        status: 'SUCCESS',
        razorpayPaymentId: paymentId,
        rawResponse: entity,
        paidAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await this.invoicesService.applyPayment(payment.invoiceId, Number(payment.amount));

    await this.notifications.sendNotificationToUnit(
      payment.unitId,
      'PAYMENT_CONFIRMED',
      'Payment received',
      `We've received your payment of ₹${payment.amount}. Thank you!`,
      { invoiceId: payment.invoiceId },
    );

    return { handled: true };
  }
}
