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
import { GenerationCreditsService } from '../generation-credits/generation-credits.service';
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
import { contentCreditReference } from './content.service';

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
    private readonly generationCredits: GenerationCreditsService,
  ) {
    super();
  }

  async process(job: Job<ContentGenerationJob>): Promise<void> {
    const { contentId, revision, usePrevious } = job.data;

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

    // Cheap pre-check: skip the agent call entirely when the job was already
    // superseded before it even started. The write below is still guarded,
    // because the row can also move while the agent is running.
    if (content.generationRevision !== revision) {
      this.logger.log(
        `Skipping superseded generation for content ${contentId} ` +
          `(job revision ${revision}, row at ${content.generationRevision})`,
      );
      return;
    }

    // Thrown errors propagate on purpose: BullMQ retries them, and the row is
    // only marked FAILED once the attempts are used up (see onFailed).
    const draft = await this.generator.generate(
      this.buildBrief(content, usePrevious),
    );

    // Conditional on the revision, so a job that lost the race to a newer
    // regenerate or a manual edit writes nothing at all rather than reverting
    // the newer content and clearing isEdited. `version` is incremented here
    // and only here: it counts outputs the agent actually delivered.
    const { count } = await this.prisma.generatedContent.updateMany({
      where: { id: contentId, generationRevision: revision },
      data: {
        type: draft.type || content.type,
        title: draft.title ?? null,
        body: draft.body ?? null,
        payload: toJsonInput(draft),
        format: draft.format ?? ContentFormat.TEXT,
        model: draft.model ?? null,
        status: GeneratedContentStatus.READY,
        error: null,
        version: { increment: 1 },
        isEdited: false,
      },
    });

    if (count === 0) {
      this.logger.log(
        `Discarded stale generation result for content ${contentId} ` +
          `(job revision ${revision} was superseded while the agent ran)`,
      );
    }
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
    const { contentId, revision } = job.data;

    this.logger.error(
      `Generation attempt ${job.attemptsMade}/${attempts} failed for content ${contentId}: ${message}`,
      error?.stack,
    );

    if (job.attemptsMade < attempts) {
      return;
    }

    try {
      // Guarded like the success path: a failure that belongs to a superseded
      // job must not stamp FAILED over content a newer run or edit produced.
      // The row may also be gone, which updateMany reports as 0 rather than
      // throwing.
      const { count } = await this.prisma.generatedContent.updateMany({
        where: { id: contentId, generationRevision: revision },
        data: { status: GeneratedContentStatus.FAILED, error: message },
      });

      if (count === 0) {
        this.logger.log(
          `Not recording failure for content ${contentId}: job revision ` +
            `${revision} is superseded or the row is gone`,
        );
      }
      if (count > 0) {
        await this.generationCredits.refund(
          contentCreditReference(contentId, revision),
        );
      }
    } catch {
      this.logger.warn(`Could not mark content ${contentId} as FAILED`);
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
