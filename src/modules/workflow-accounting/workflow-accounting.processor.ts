import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { WorkflowAccountingStatus } from '@prisma/client';
import { Job } from 'bullmq';

import {
  WORKFLOW_ACCOUNTING_QUEUE,
  WorkflowAccountingJob,
} from './workflow-accounting.queue';
import { WorkflowAccountingService } from './workflow-accounting.service';

@Processor(WORKFLOW_ACCOUNTING_QUEUE)
export class WorkflowAccountingProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowAccountingProcessor.name);

  constructor(private readonly accounting: WorkflowAccountingService) {
    super();
  }

  async process(job: Job<WorkflowAccountingJob>): Promise<void> {
    const status = await this.accounting.collect(job.data.executionId);
    if (status === WorkflowAccountingStatus.PENDING) {
      throw new Error('Mastra usage metrics are still pending');
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<WorkflowAccountingJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    this.logger.warn(
      `Workflow accounting ${job.data.executionId} is unavailable after reconciliation: ${error.message}`,
    );
    await this.accounting.markUnavailable(job.data.executionId);
  }
}
