import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { KnowledgeSourceStatus, Prisma, WorkflowRunStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { MastraClient } from '../mastra/mastra.client';
import { MASTRA_WORKFLOWS } from '../mastra/mastra.types';
import { toErrorMessage, toWorkflowRunStatus } from '../mastra/run-status';
import { toGeneratedContentRows } from './calendar-fanout';
import {
  CONTENT_WORKFLOW_QUEUE,
  ContentWorkflowJob,
} from './content-workflow.queue';

@Processor(CONTENT_WORKFLOW_QUEUE)
export class ContentWorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentWorkflowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastra: MastraClient,
  ) {
    super();
  }

  async process(job: Job<ContentWorkflowJob>): Promise<void> {
    const { contentRunId } = job.data;

    const run = await this.prisma.campaignContentRun.findUnique({
      where: { id: contentRunId },
      include: { campaign: { select: { projectId: true, project: { select: { brandProfile: true } } } } },
    });

    if (!run) {
      this.logger.warn(
        `Content run ${contentRunId} no longer exists, dropping job`,
      );
      return;
    }

    if (!run.runId) {
      await this.fail(
        contentRunId,
        'No Mastra run id was reserved for this run',
      );
      return;
    }

    await this.prisma.campaignContentRun.updateMany({
      where: { id: contentRunId },
      data: { status: WorkflowRunStatus.RUNNING },
    });

    const { resume } = job.data;

    const readySources = await this.prisma.knowledgeSource.findMany({
      where: { projectId: run.campaign.projectId, status: KnowledgeSourceStatus.READY },
      select: { id: true },
    });

    const result = resume
      ? await this.mastra.resumeRun(
          MASTRA_WORKFLOWS.content,
          run.runId,
          resume.step,
          resume.resumeData,
        )
      : await this.mastra.startRun(
          MASTRA_WORKFLOWS.content,
          run.runId,
          {
            ...(run.input as Record<string, unknown>),
            knowledgeScope: {
              projectId: run.campaign.projectId,
              sourceIds: readySources.map((source) => source.id),
            },
            ...(run.campaign.project.brandProfile
              ? { brandProfile: run.campaign.project.brandProfile }
              : {}),
          },
        );

    const status = toWorkflowRunStatus(result);

    const rows =
      status === WorkflowRunStatus.READY
        ? toGeneratedContentRows(run.campaignId, contentRunId, result.result)
        : [];

    // The status flip and the fan-out go in together: a READY run whose rows
    // are missing would look complete while its content silently does not
    // exist. Either both land or neither does.
    let written: number;
    try {
      const [updated] = await this.prisma.$transaction([
        this.prisma.campaignContentRun.updateMany({
          where: { id: contentRunId },
          data: {
            status,
            output:
              status === WorkflowRunStatus.READY
                ? (result.result as Prisma.InputJsonValue)
                : Prisma.DbNull,
            suspendPayload:
              status === WorkflowRunStatus.SUSPENDED
                ? ((result.suspended ??
                    result.steps ??
                    {}) as Prisma.InputJsonValue)
                : Prisma.DbNull,
            error:
              status === WorkflowRunStatus.FAILED
                ? toErrorMessage(result)
                : null,
            contentCount: rows.length,
          },
        }),
        this.prisma.generatedContent.createMany({ data: rows }),
      ]);
      written = updated.count;
    } catch (error) {
      // A run takes minutes, so the campaign can be deleted underneath it. The
      // fan-out's foreign keys then fail before the count check below ever runs,
      // so the deletion has to be recognised here too.
      if (await this.stillExists(contentRunId)) {
        throw error;
      }
      written = 0;
    }

    if (written === 0) {
      this.logger.warn(
        `Content run ${contentRunId} was deleted while run ${run.runId} was in flight; discarding the ${status} result`,
      );
      return;
    }

    this.logger.log(
      `Content run ${contentRunId} finished as ${status}` +
        (rows.length ? ` with ${rows.length} content rows` : ''),
    );
  }

  private async stillExists(contentRunId: string): Promise<boolean> {
    const count = await this.prisma.campaignContentRun.count({
      where: { id: contentRunId },
    });

    return count > 0;
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ContentWorkflowJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) {
      return;
    }

    const message = error?.message ?? String(error);
    this.logger.error(
      `Content run ${job.data.contentRunId} failed: ${message}`,
      error?.stack,
    );

    await this.fail(job.data.contentRunId, message);
  }

  private async fail(contentRunId: string, message: string): Promise<void> {
    const { count } = await this.prisma.campaignContentRun.updateMany({
      where: { id: contentRunId },
      data: { status: WorkflowRunStatus.FAILED, error: message },
    });

    if (count === 0) {
      this.logger.warn(`Could not mark content run ${contentRunId} as FAILED`);
    }
  }
}
