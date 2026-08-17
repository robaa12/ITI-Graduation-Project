import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import {
  KnowledgeService,
  sourceFreshness,
} from '../../knowledge/knowledge.service';
import { AdminKnowledgeSourcesQueryDto } from './dto/admin-knowledge-sources-query.dto';
import { AdminKnowledgePagesQueryDto } from './dto/admin-knowledge-pages-query.dto';
import { AdminCreateKnowledgeSourceDto } from './dto/admin-create-knowledge-source.dto';
import { AdminUpdateKnowledgeSourceDto } from './dto/admin-update-knowledge-source.dto';
import type {
  AdminKnowledgePageDetail,
  AdminKnowledgePageListItem,
  AdminKnowledgeSourceDetail,
  AdminKnowledgeSourceListItem,
} from './types/admin-knowledge.types';

@Injectable()
export class AdminKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async listSources(query: AdminKnowledgeSourcesQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      search,
      status,
      type,
      projectId,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.KnowledgeSourceWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { url: { contains: normalizedSearch, mode: 'insensitive' } },
        {
          project: {
            name: { contains: normalizedSearch, mode: 'insensitive' },
          },
        },
      ];
    }
    if (status) where.status = status;
    if (type) where.type = type;
    if (projectId) where.projectId = projectId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.KnowledgeSourceOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.knowledgeSource.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          name: true,
          url: true,
          error: true,
          indexedAt: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true } },
          _count: { select: { pages: true } },
        },
      }),
      this.prisma.knowledgeSource.count({ where }),
    ]);

    return {
      data: items.map(
        ({ project, _count, ...source }): AdminKnowledgeSourceListItem => ({
          ...source,
          project,
          pageCount: _count.pages,
          freshness: sourceFreshness(source),
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSource(id: string): Promise<AdminKnowledgeSourceDetail> {
    const source = await this.prisma.knowledgeSource.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        url: true,
        metadata: true,
        error: true,
        indexedAt: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { pages: true } },
      },
    });

    if (!source) {
      throw new NotFoundException(`Knowledge source with ID ${id} not found`);
    }

    const { project, _count, ...rest } = source;

    return {
      ...rest,
      project: {
        id: project.id,
        name: project.name,
        owner: project.user,
      },
      pageCount: _count.pages,
      freshness: sourceFreshness(rest),
    };
  }

  async listPages(query: AdminKnowledgePagesQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      search,
      sourceId,
      projectId,
    } = query;

    const where: Prisma.KnowledgePageWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { title: { contains: normalizedSearch, mode: 'insensitive' } },
        { url: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }
    if (sourceId) where.sourceId = sourceId;
    if (projectId) where.source = { projectId };

    const orderBy: Prisma.KnowledgePageOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { crawledAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.knowledgePage.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          url: true,
          title: true,
          error: true,
          crawledAt: true,
          createdAt: true,
          updatedAt: true,
          source: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.knowledgePage.count({ where }),
    ]);

    return {
      data: items.map(({ source, ...page }): AdminKnowledgePageListItem => ({
        ...page,
        source,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPage(id: string): Promise<AdminKnowledgePageDetail> {
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        title: true,
        content: true,
        contentHash: true,
        error: true,
        crawledAt: true,
        createdAt: true,
        updatedAt: true,
        source: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            url: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException(`Knowledge page with ID ${id} not found`);
    }

    const { source, ...rest } = page;

    return {
      ...rest,
      source: {
        id: source.id,
        name: source.name,
        type: source.type,
        status: source.status,
        url: source.url,
      },
      project: {
        id: source.project.id,
        name: source.project.name,
      },
    };
  }

  async createSource(dto: AdminCreateKnowledgeSourceDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException(`Project with ID ${dto.projectId} not found`);
    }
    return this.knowledge.adminCreateWebsite(dto.projectId, {
      url: dto.url,
      name: dto.name,
    });
  }

  async updateSource(id: string, dto: AdminUpdateKnowledgeSourceDto) {
    return this.knowledge.adminUpdateSource(id, dto);
  }

  async deleteSource(id: string) {
    const source = await this.prisma.knowledgeSource.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!source) {
      throw new NotFoundException(`Knowledge source with ID ${id} not found`);
    }
    await this.knowledge.adminRemove(id);
    return { id, name: source.name, deleted: true };
  }

  async refreshSource(id: string) {
    return this.knowledge.adminRefresh(id);
  }
}
