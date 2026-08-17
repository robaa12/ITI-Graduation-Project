import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import { KnowledgeService } from './knowledge.service';
import { KNOWLEDGE_QUEUE, KnowledgeIndexJob } from './knowledge.queue';

@Processor(KNOWLEDGE_QUEUE)
export class KnowledgeProcessor extends WorkerHost {
  constructor(private readonly knowledge: KnowledgeService) {
    super();
  }

  async process(job: Job<KnowledgeIndexJob>) {
    await this.knowledge.index(job.data.sourceId);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<KnowledgeIndexJob> | undefined) {
    if (job)
      console.error(
        `Knowledge indexing failed for source ${job.data.sourceId}`,
      );
  }
}
