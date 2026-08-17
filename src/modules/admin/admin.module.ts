import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { WorkflowAccountingModule } from '../workflow-accounting/workflow-accounting.module';
import { SocialModule } from '../social/social.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminProjectsController } from './projects/admin-projects.controller';
import { AdminProjectsService } from './projects/admin-projects.service';
import { AdminKnowledgeController } from './knowledge/admin-knowledge.controller';
import { AdminKnowledgeService } from './knowledge/admin-knowledge.service';
import { AdminCampaignsController } from './campaigns/admin-campaigns.controller';
import { AdminCampaignsService } from './campaigns/admin-campaigns.service';
import { AdminWorkflowsController } from './workflows/admin-workflows.controller';
import { AdminWorkflowsService } from './workflows/admin-workflows.service';
import { AdminSocialPublicationsController } from './social/admin-social-publications.controller';
import { AdminSocialPublicationsService } from './social/admin-social-publications.service';
import { AdminSocialConnectionsController } from './social/admin-social-connections.controller';
import { AdminSocialAccountsController } from './social/admin-social-accounts.controller';
import { AdminSocialAccountsService } from './social/admin-social-accounts.service';
import { AdminBillingController } from './billing/admin-billing.controller';
import { AdminBillingService } from './billing/admin-billing.service';
import { AdminStrategyController } from './strategy/admin-strategy.controller';
import { AdminStrategyService } from './strategy/admin-strategy.service';
import { AdminContentController } from './content/admin-content.controller';
import { AdminContentService } from './content/admin-content.service';
import { AuthService } from '../auth/auth.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    KnowledgeModule,
    CampaignsModule,
    WorkflowAccountingModule,
    SocialModule,
  ],
  controllers: [
    AdminController,
    AdminDashboardController,
    AdminProjectsController,
    AdminKnowledgeController,
    AdminCampaignsController,
    AdminWorkflowsController,
    AdminSocialPublicationsController,
    AdminSocialConnectionsController,
    AdminSocialAccountsController,
    AdminBillingController,
    AdminStrategyController,
    AdminContentController,
  ],
  providers: [
    AdminService,
    AdminDashboardService,
    AdminProjectsService,
    AdminKnowledgeService,
    AdminCampaignsService,
    AdminWorkflowsService,
    AdminSocialPublicationsService,
    AdminSocialAccountsService,
    AdminBillingService,
    AdminStrategyService,
    AdminContentService,
    {
      provide: AdminGuard,
      useFactory: (authService: AuthService) => new AdminGuard(authService),
      inject: [AuthService],
    },
  ],
  exports: [
    AdminService,
    AdminDashboardService,
    AdminProjectsService,
    AdminKnowledgeService,
    AdminCampaignsService,
    AdminWorkflowsService,
    AdminSocialPublicationsService,
    AdminSocialAccountsService,
    AdminBillingService,
    AdminStrategyService,
    AdminContentService,
    AdminGuard,
  ],
})
export class AdminModule {}
