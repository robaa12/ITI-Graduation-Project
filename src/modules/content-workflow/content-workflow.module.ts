import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { GenerationCreditsModule } from '../generation-credits/generation-credits.module';
import { MastraModule } from '../mastra/mastra.module';
import { StrategyModule } from '../strategy/strategy.module';
import { WorkflowAccountingModule } from '../workflow-accounting/workflow-accounting.module';
import { ProductAssetsModule } from '../product-assets/product-assets.module';
import {
  CampaignContentRunController,
  ContentRunController,
} from './content-workflow.controller';
import { ContentWorkflowProcessor } from './content-workflow.processor';
import { CONTENT_WORKFLOW_QUEUE } from './content-workflow.queue';
import { ContentWorkflowService } from './content-workflow.service';

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    GenerationCreditsModule,
    MastraModule,
    // For the ownership check on the strategy a run is built from.
    StrategyModule,
    WorkflowAccountingModule,
    ProductAssetsModule,
    BullModule.registerQueue({ name: CONTENT_WORKFLOW_QUEUE }),
  ],
  controllers: [CampaignContentRunController, ContentRunController],
  providers: [ContentWorkflowService, ContentWorkflowProcessor],
  exports: [ContentWorkflowService],
})
export class ContentWorkflowModule {}
