import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DisputesModule } from './disputes/disputes.module';
import { EscrowModule } from './escrow/escrow.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { LinksModule } from './links/links.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProcurementModule } from './procurement/procurement.module';
import { ProjectsModule } from './projects/projects.module';
import { SearchModule } from './search/search.module';
import { UploadsModule } from './uploads/uploads.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    JobsModule,
    AuthModule,
    ProjectsModule,
    SearchModule,
    CatalogModule,
    ProcurementModule,
    EscrowModule,
    OrdersModule,
    LinksModule,
    PaymentsModule,
    VerificationModule,
    DisputesModule,
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
