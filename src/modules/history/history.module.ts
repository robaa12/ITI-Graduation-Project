import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowAccountingModule } from '../workflow-accounting/workflow-accounting.module';
import { HistoryController } from './history.controller';

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    ProjectsModule,
    WorkflowAccountingModule,
  ],
  controllers: [HistoryController],
})
export class HistoryModule {}
