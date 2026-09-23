import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingPlansService } from './billing-plans.service';
import { ChargeTypesService } from './charge-types.service';
import { ChargesService } from './charges.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { BillingReportsService } from './billing-reports.service';
import { BillingSchedulerService } from './billing-scheduler.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  providers: [
    BillingPlansService,
    ChargeTypesService,
    ChargesService,
    InvoicesService,
    PaymentsService,
    BillingReportsService,
    BillingSchedulerService,
  ],
  exports: [
    BillingPlansService,
    ChargeTypesService,
    ChargesService,
    InvoicesService,
    PaymentsService,
    BillingReportsService,
  ],
})
export class BillingModule {}
