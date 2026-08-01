import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  Campaign,
  ContentFormat,
  GeneratedContent,
  GeneratedContentStatus,
  Prisma,
  Project,
} from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import {
  CONTENT_GENERATION_QUEUE,
  ContentGenerationJob,
} from './content-generation.queue';
import { CONTENT_GENERATOR } from './generator/content-generator.port';
import type {
  ContentGenerationBrief,
  ContentGeneratorPort,
  GeneratedContentDraft,
} from './generator/content-generator.port';

type ContentWithContext = GeneratedContent & {
  campaign: Campaign & { project: Project };
};

/**
 * Runs the generation agent off the request path. The HTTP handler only writes
 * a PENDING row and enqueues; everything below happens in the worker, so a
 * client disconnect can no longer abandon a half-finished generation and a
 * process restart resumes the job from Redis instead of stranding the row.
 */
@Processor(CONTENT_GENERATION_QUEUE)
export class ContentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_GENERATOR)
    private readonly generator: ContentGeneratorPort,
  ) {
    super();
  }

  async process(job: Job<ContentGenerationJob>): Promise<void> {
    const { contentId, version, usePrevious } = job.data;

    const content = await this.prisma.generatedContent.findUnique({
      where: { id: contentId },
      include: { campaign: { include: { project: true } } },
    });

    if (!content) {
      // Deleted while the job was queued. There is nothing to write back to,
      // and failing would only retry against a row that will never return.
      this.logger.warn(
        `Content ${contentId} no longer exists, dropping generation job`,
      );
      return;
    }

    // Thrown errors propagate on purpose: BullMQ retries them, and the row is
    // only marked FAILED once the attempts are used up (see onFailed).
    const draft = await this.generator.generate(
      this.buildBrief(content, usePrevious),
    );

    await this.prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        type: draft.type || content.type,
        title: draft.title ?? null,
        body: draft.body ?? null,
        payload: toJsonInput(draft),
        format: draft.format ?? ContentFormat.TEXT,
        model: draft.model ?? null,
        status: GeneratedContentStatus.READY,
        error: null,
        version,
        isEdited: false,
      },
    });
  }

  /**
   * Fires on every attempt, so the row is only closed out as FAILED once no
   * retry is coming. Leaving it PENDING between attempts is what lets the
   * client keep showing "generating" while the queue backs off and tries again.
   */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ContentGenerationJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) {
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    const message = error?.message ?? String(error);

    this.logger.error(
      `Generation attempt ${job.attemptsMade}/${attempts} failed for content ${job.data.contentId}: ${message}`,
      error?.stack,
    );

    if (job.attemptsMade < attempts) {
      return;
    }

    try {
      await this.prisma.generatedContent.update({
        where: { id: job.data.contentId },
        data: { status: GeneratedContentStatus.FAILED, error: message },
      });
    } catch {
      // The row may have been deleted in the meantime; the job is already
      // failed and there is nothing left to record against.
      this.logger.warn(
        `Could not mark content ${job.data.contentId} as FAILED`,
      );
    }
  }

  /** Everything the agent needs about the campaign and its project. */
  private buildBrief(
    content: ContentWithContext,
    usePrevious: boolean,
  ): ContentGenerationBrief {
    const { campaign } = content;

    return {
      project: {
        id: campaign.project.id,
        name: campaign.project.name,
        description: campaign.project.description,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        objective: campaign.objective,
        audience: campaign.audience,
        tone: campaign.tone,
        channels: campaign.channels,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      },
      type: content.type,
      instructions: content.prompt ?? undefined,
      previous: usePrevious
        ? {
            title: content.title,
            body: content.body,
            payload: content.payload,
          }
        : null,
    };
  }
}

function toJsonInput(
  draft: GeneratedContentDraft,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return draft.payload === undefined || draft.payload === null
    ? Prisma.DbNull
    : draft.payload;
}
