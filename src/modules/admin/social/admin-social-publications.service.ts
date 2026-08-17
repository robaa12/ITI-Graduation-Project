import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  SocialConnectionProvider,
  SocialConnectionStatus,
  SocialPlatform,
  SocialPublicationStatus,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { SocialPublicationsService } from '../../social/social-publications.service';
import { AdminSocialPublicationsQueryDto } from './dto/admin-social-publications-query.dto';
import { AdminUpdateSocialPublicationDto } from './dto/admin-update-social-publication.dto';
import type {
  AdminSocialAccountRef,
  AdminSocialPublicationDetail,
  AdminSocialPublicationListItem,
} from './types/admin-social-publications.types';

/** A publication row plus the refs it links to. */
type PublicationWithRefs = {
  id: string;
  status: SocialPublicationStatus;
  scheduledFor: Date;
  caption: string;
  platform: SocialPlatform;
  accountName: string;
  externalAccountId: string;
  publishedAt: Date | null;
  externalPostId: string | null;
  error: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  content: ContentRef | null;
  socialAccount: AccountRef | null;
};

interface ContentRef {
  id: string;
  title: string | null;
  campaign: CampaignRef | null;
}

interface CampaignRef {
  id: string;
  name: string;
  project: ProjectRef | null;
}

interface ProjectRef {
  id: string;
  name: string;
}

interface AccountRef {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
  imageUrl: string | null;
  externalId: string;
  selected: boolean;
  available: boolean;
  connection: ConnectionRef | null;
}

interface ConnectionRef {
  id: string;
  status: SocialConnectionStatus;
  provider: SocialConnectionProvider;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

@Injectable()
export class AdminSocialPublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: SocialPublicationsService,
  ) {}

  async listPublications(query: AdminSocialPublicationsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      status,
      platform,
      socialAccountId,
      campaignId,
      projectId,
      from,
      to,
      search,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.SocialPublicationWhereInput = {};
    if (status) where.status = status;
    if (platform) where.platform = platform;
    if (socialAccountId) where.socialAccountId = socialAccountId;
    const relationFilters: Prisma.SocialPublicationWhereInput[] = [];
    if (campaignId) relationFilters.push({ content: { campaignId } });
    if (projectId) {
      relationFilters.push({ content: { campaign: { projectId } } });
    }
    if (relationFilters.length > 0) where.AND = relationFilters;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { accountName: { contains: normalizedSearch, mode: 'insensitive' } },
        {
          content: {
            title: { contains: normalizedSearch, mode: 'insensitive' },
          },
        },
      ];
    }

    const orderBy: Prisma.SocialPublicationOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.socialPublication.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.publicationSelect,
          ...this.publicationRefsSelect,
        },
      }),
      this.prisma.socialPublication.count({ where }),
    ]);

    return {
      data: items.map((item): AdminSocialPublicationListItem =>
        this.presentListItem(item as PublicationWithRefs),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  protected publicationSelect = {
    id: true,
    status: true,
    scheduledFor: true,
    caption: true,
    platform: true,
    accountName: true,
    externalAccountId: true,
    publishedAt: true,
    externalPostId: true,
    error: true,
    revision: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.SocialPublicationSelect;

  protected socialAccountRefSelect = {
    select: {
      id: true,
      platform: true,
      name: true,
      username: true,
      imageUrl: true,
      externalId: true,
      selected: true,
      available: true,
      connection: {
        select: {
          id: true,
          status: true,
          provider: true,
          lastSyncedAt: true,
          lastError: true,
        },
      },
    },
  } as const;

  protected publicationRefsSelect = {
    content: {
      select: {
        id: true,
        title: true,
        campaign: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    },
    socialAccount: this.socialAccountRefSelect,
  } satisfies Prisma.SocialPublicationSelect;

  protected presentListItem(
    publication: PublicationWithRefs,
  ): AdminSocialPublicationListItem {
    const { content, socialAccount, ...rest } = publication;
    return {
      ...rest,
      content: content ? { id: content.id, title: content.title } : null,
      campaign: content?.campaign
        ? { id: content.campaign.id, name: content.campaign.name }
        : null,
      project: content?.campaign?.project
        ? {
            id: content.campaign.project.id,
            name: content.campaign.project.name,
          }
        : null,
      socialAccount: socialAccount ? this.presentAccount(socialAccount) : null,
    };
  }

  protected presentAccount(account: AccountRef): AdminSocialAccountRef {
    return {
      id: account.id,
      platform: account.platform,
      name: account.name,
      username: account.username,
      imageUrl: account.imageUrl,
      externalId: account.externalId,
      selected: account.selected,
      available: account.available,
      connection: account.connection
        ? {
            id: account.connection.id,
            provider: account.connection.provider,
            status: account.connection.status,
            lastSyncedAt: account.connection.lastSyncedAt,
            lastError: account.connection.lastError,
          }
        : null,
    };
  }

  async getPublication(id: string): Promise<AdminSocialPublicationDetail> {
    const publication = await this.prisma.socialPublication.findUnique({
      where: { id },
      select: {
        ...this.publicationSelect,
        mediaUrl: true,
        content: {
          select: {
            id: true,
            title: true,
            type: true,
            format: true,
            status: true,
            campaign: {
              select: {
                id: true,
                name: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    user: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
          },
        },
        socialAccount: this.socialAccountRefSelect,
      },
    });

    if (!publication) {
      throw new NotFoundException(`Social publication with ID ${id} not found`);
    }

    const { content, socialAccount, ...rest } = publication;
    const project = content?.campaign?.project ?? null;

    return {
      ...rest,
      content: content
        ? {
            id: content.id,
            title: content.title,
            type: content.type,
            format: content.format,
            status: content.status,
          }
        : null,
      campaign: content?.campaign
        ? { id: content.campaign.id, name: content.campaign.name }
        : null,
      project: project
        ? {
            id: project.id,
            name: project.name,
            owner: {
              id: project.user.id,
              name: project.user.name,
              email: project.user.email,
            },
          }
        : null,
      socialAccount: socialAccount ? this.presentAccount(socialAccount) : null,
    };
  }

  async updatePublication(id: string, dto: AdminUpdateSocialPublicationDto) {
    return this.publications.adminUpdateCaption(id, dto.caption);
  }

  /**
   * Safe deletion: the domain model has no hard delete — DELETE on the
   * user-facing API cancels the publication (QUEUED/SCHEDULED only), which
   * keeps the queue job consistent and the external post from being orphaned.
   */
  async deletePublication(id: string) {
    const publication = await this.publications.adminCancel(id);
    return {
      id: publication.id,
      status: publication.status,
      cancelled: true,
    };
  }
}
