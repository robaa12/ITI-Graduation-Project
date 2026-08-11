import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MastraModule } from '../mastra/mastra.module';
import { WorkflowAccountingProcessor } from './workflow-accounting.processor';
import { WORKFLOW_ACCOUNTING_QUEUE } from './workflow-accounting.queue';
import { WorkflowAccountingService } from './workflow-accounting.service';

@Module({
  imports: [
    MastraModule,
    BullModule.registerQueue({ name: WORKFLOW_ACCOUNTING_QUEUE }),
  ],
  providers: [WorkflowAccountingService, WorkflowAccountingProcessor],
  exports: [WorkflowAccountingService],
})
export class WorkflowAccountingModule {}
