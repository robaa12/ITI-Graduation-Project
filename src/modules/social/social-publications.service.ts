import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GeneratedContentStatus,
  SocialConnectionStatus,
  SocialPlatform,
  SocialPublication,
  SocialPublicationStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateSocialPublicationDto } from './dto/create-social-publication.dto';
import { QuerySocialPublicationsDto } from './dto/query-social-publications.dto';
import {
  SOCIAL_PUBLICATION_QUEUE,
  SocialPublicationJob,
} from './social-publication.queue';

const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1_000;

@Injectable()
export class SocialPublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SOCIAL_PUBLICATION_QUEUE)
    private readonly queue: Queue<SocialPublicationJob>,
  ) {}

  async listForUser(userId: string, query: QuerySocialPublicationsDto) {
    const where = {
      content: { campaign: { project: { userId } } },
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.socialPublication.findMany({
        where,
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          content: {
            select: {
              id: true,
              title: true,
              body: true,
              campaign: { select: { id: true, name: true } },
            },
          },
          socialAccount: {
            select: { id: true, name: true, username: true, platform: true },
          },
        },
      }),
      this.prisma.socialPublication.count({ where }),
    ]);
    return {
      items,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(
    userId: string,
    contentId: string,
    dto: CreateSocialPublicationDto,
  ): Promise<SocialPublication> {
    const [content, account] = await Promise.all([
      this.prisma.generatedContent.findFirst({
        where: { id: contentId, campaign: { project: { userId } } },
        include: { contentRun: true },
      }),
      this.prisma.socialAccount.findFirst({
        where: {
          id: dto.socialAccountId,
          connection: { userId },
        },
        include: { connection: true },
      }),
    ]);

    if (!content)
      throw new NotFoundException(`Generated content ${contentId} not found`);
    if (!account) {
      throw new NotFoundException(
        `Social account ${dto.socialAccountId} not found`,
      );
    }
    if (
      content.status !== GeneratedContentStatus.READY ||
      !content.body?.trim()
    ) {
      throw new ConflictException(
        'Only READY content with copy can be published',
      );
    }
    if (
      !content.contentRun ||
      !content.contentRun.strategyId ||
      content.contentRun.status !== WorkflowRunStatus.READY
    ) {
      throw new ConflictException(
        'Publishing requires content produced from a completed approved-strategy workflow',
      );
    }
    if (
      !account.selected ||
      !account.available ||
      account.connection.status !== SocialConnectionStatus.ACTIVE
    ) {
      throw new ConflictException(
        'Choose an active, available social account before publishing',
      );
    }

    const scheduledFor = dto.scheduledFor
      ? new Date(dto.scheduledFor)
      : new Date();
    const now = Date.now();
    if (scheduledFor.getTime() < now - 60_000) {
      throw new BadRequestException('scheduledFor cannot be in the past');
    }
    if (scheduledFor.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
      throw new BadRequestException(
        'scheduledFor cannot be more than one year ahead',
      );
    }

    const { caption, mediaUrl } = buildPublicationSnapshot(
      content.body,
      content.payload,
    );
    if (account.platform === SocialPlatform.INSTAGRAM) {
      if (!mediaUrl) {
        throw new BadRequestException(
          'Instagram publishing requires a public HTTPS image URL',
        );
      }
      if (caption.length > 2_200) {
        throw new BadRequestException(
          'Instagram captions cannot exceed 2200 characters',
        );
      }
    }

    const delayed = scheduledFor.getTime() > now + 1_000;
    const publication = await this.prisma.socialPublication.create({
      data: {
        contentId,
        socialAccountId: account.id,
        caption,
        mediaUrl,
        platform: account.platform,
        accountName: account.name,
        externalAccountId: account.externalId,
        scheduledFor,
        status: delayed
          ? SocialPublicationStatus.SCHEDULED
          : SocialPublicationStatus.QUEUED,
      },
    });

    try {
      await this.enqueue(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.socialPublication.updateMany({
        where: { id: publication.id, revision: publication.revision },
        data: { status: SocialPublicationStatus.FAILED, error: message },
      });
      throw new ServiceUnavailableException(
        'The publishing queue is unavailable, please retry',
      );
    }
    return publication;
  }

  async listForContent(userId: string, contentId: string) {
    await this.assertContentOwned(userId, contentId);
    return this.prisma.socialPublication.findMany({
      where: { contentId },
      orderBy: { createdAt: 'desc' },
      include: {
        socialAccount: {
          select: {
            id: true,
            platform: true,
            externalId: true,
            name: true,
            username: true,
          },
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const publication = await this.prisma.socialPublication.findFirst({
      where: {
        id,
        content: { campaign: { project: { userId } } },
      },
      include: {
        socialAccount: {
          select: {
            id: true,
            platform: true,
            externalId: true,
            name: true,
            username: true,
          },
        },
      },
    });
    if (!publication) {
      throw new NotFoundException(`Social publication ${id} not found`);
    }
    return publication;
  }

  async cancel(userId: string, id: string): Promise<SocialPublication> {
    const publication = await this.findOwnedOrFail(userId, id);
    if (
      publication.status !== SocialPublicationStatus.QUEUED &&
      publication.status !== SocialPublicationStatus.SCHEDULED
    ) {
      throw new ConflictException(
        `A ${publication.status} publication cannot be cancelled`,
      );
    }
    return this.prisma.socialPublication.update({
      where: { id },
      data: {
        status: SocialPublicationStatus.CANCELLED,
        error: null,
        revision: { increment: 1 },
      },
    });
  }

  async retry(userId: string, id: string): Promise<SocialPublication> {
    const publication = await this.findOwnedOrFail(userId, id);
    if (publication.status !== SocialPublicationStatus.FAILED) {
      throw new ConflictException('Only FAILED publications can be retried');
    }
    const updated = await this.prisma.socialPublication.update({
      where: { id },
      data: {
        status: SocialPublicationStatus.QUEUED,
        scheduledFor: new Date(),
        publishedAt: null,
        externalPostId: null,
        error: null,
        revision: { increment: 1 },
      },
    });
    try {
      await this.enqueue(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.socialPublication.updateMany({
        where: { id, revision: updated.revision },
        data: { status: SocialPublicationStatus.FAILED, error: message },
      });
      throw new ServiceUnavailableException(
        'The publishing queue is unavailable, please retry',
      );
    }
    return updated;
  }

  private enqueue(publication: SocialPublication): Promise<unknown> {
    return this.queue.add(
      'publish',
      { publicationId: publication.id, revision: publication.revision },
      {
        jobId: `${publication.id}-r${publication.revision}`,
        delay: Math.max(publication.scheduledFor.getTime() - Date.now(), 0),
        // Retrying an ambiguous provider response can create a duplicate post.
        // A human can use the explicit retry endpoint after checking the Page.
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1_000 },
      },
    );
  }

  private async assertContentOwned(
    userId: string,
    contentId: string,
  ): Promise<void> {
    const count = await this.prisma.generatedContent.count({
      where: { id: contentId, campaign: { project: { userId } } },
    });
    if (!count) {
      throw new NotFoundException(`Generated content ${contentId} not found`);
    }
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const publication = await this.prisma.socialPublication.findFirst({
      where: { id, content: { campaign: { project: { userId } } } },
    });
    if (!publication) {
      throw new NotFoundException(`Social publication ${id} not found`);
    }
    return publication;
  }
}

function buildPublicationSnapshot(
  body: string,
  payload: unknown,
): { caption: string; mediaUrl: string | null } {
  const value =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const hashtags = Array.isArray(value.hashtags)
    ? value.hashtags.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];
  const cta = typeof value.cta === 'string' ? value.cta.trim() : '';
  const parts = [body.trim(), hashtags.join(' '), cta].filter(Boolean);
  const rawMediaUrl =
    typeof value.imageUrl === 'string' ? value.imageUrl.trim() : '';
  const mediaUrl = publicHttpsUrl(rawMediaUrl);
  return { caption: parts.join('\n\n'), mediaUrl };
}

function publicHttpsUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
