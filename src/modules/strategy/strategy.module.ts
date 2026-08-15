import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { MastraModule } from '../mastra/mastra.module';
import { WorkflowAccountingModule } from '../workflow-accounting/workflow-accounting.module';
import {
  CampaignStrategyController,
  StrategyController,
} from './strategy.controller';
import { StrategyProcessor } from './strategy.processor';
import { STRATEGY_QUEUE } from './strategy.queue';
import { StrategyService } from './strategy.service';

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    MastraModule,
    WorkflowAccountingModule,
    BullModule.registerQueue({ name: STRATEGY_QUEUE }),
  ],
  controllers: [CampaignStrategyController, StrategyController],
  providers: [StrategyService, StrategyProcessor],
  exports: [StrategyService],
})
export class StrategyModule {}
