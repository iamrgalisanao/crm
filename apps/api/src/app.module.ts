import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RolesModule } from './roles/roles.module';
import { AccountsModule } from './accounts/accounts.module';
import { ContactsModule } from './contacts/contacts.module';
import { LeadsModule } from './leads/leads.module';
import { ActivitiesModule } from './activities/activities.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ProductsModule } from './products/products.module';
import { QuotationsModule } from './quotations/quotations.module';
import { OrdersModule } from './orders/orders.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ImportExportModule } from './import-export/import-export.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AiModule } from './ai/ai.module';
import { AutomationModule } from './automation/automation.module';
import { HealthModule } from './health/health.module';

import { ContextMiddleware } from './common/context/context.middleware';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/rbac/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    // Global rate limit: 120 requests/minute per client IP (auth routes are stricter).
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    RolesModule,
    AccountsModule,
    ContactsModule,
    LeadsModule,
    ActivitiesModule,
    OpportunitiesModule,
    ProductsModule,
    QuotationsModule,
    OrdersModule,
    InvoicesModule,
    PaymentsModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    ImportExportModule,
    IntegrationsModule,
    AiModule,
    AutomationModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate-limit first, then authenticate (also hydrates tenant
    // context), then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
