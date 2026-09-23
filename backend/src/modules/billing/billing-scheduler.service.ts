import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';
import { societies } from '../../database/schema';
import { InvoicesService } from './invoices.service';

/**
 * Runs with no authenticated request behind it, so every DB access here goes through
 * drizzle.withSystemContext (the same is_superadmin RLS bypass RbacService uses for its
 * own pre-tenant lookups — see rls.helper.ts) rather than the per-request tenant
 * transaction RbacScopeGuard normally sets up. Every query inside InvoicesService already
 * filters by societyId explicitly, so this bypass is a formality, not a scoping mechanism.
 */
@Injectable()
export class BillingSchedulerService {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /** 1st of every month, 10:00 — combines the month's plan + START_OF_MONTH charges. */
  @Cron('0 10 1 * *')
  async handleMonthlyGeneration() {
    await this.drizzle.withSystemContext(async () => {
      const activeSocieties = await this.drizzle.db
        .select({ id: societies.id })
        .from(societies)
        .where(eq(societies.status, 'ACTIVE'));

      for (const society of activeSocieties) {
        try {
          await this.invoicesService.generateForSociety(society.id);
        } catch (err) {
          this.logger.error(`Monthly bill generation failed for society ${society.id}`, err as Error);
        }
      }
    });
  }

  /** Daily at 05:00 — flips overdue invoices and sends due-soon reminders. */
  @Cron('0 5 * * *')
  async handleDailyOverdueSweep() {
    await this.drizzle.withSystemContext(async () => {
      const flipped = await this.invoicesService.markOverdue();
      if (flipped > 0) {
        this.logger.log(`Marked ${flipped} invoice(s) OVERDUE`);
      }

      const reminded = await this.invoicesService.sendDueSoonReminders();
      if (reminded > 0) {
        this.logger.log(`Sent ${reminded} due-soon reminder(s)`);
      }
    });
  }
}
