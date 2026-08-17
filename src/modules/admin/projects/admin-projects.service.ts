import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AdminProjectsQueryDto } from './dto/admin-projects-query.dto';
import { AdminUpdateProjectDto } from './dto/admin-update-project.dto';
import {
  AdminProjectDetail,
  AdminProjectListItem,
} from './types/admin-projects.types';

@Injectable()
export class AdminProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(query: AdminProjectsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      search,
      status,
      ownerId,
    } = query;

    const where: Prisma.ProjectWhereInput = {};
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { user: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
        {
          user: { email: { contains: normalizedSearch, mode: 'insensitive' } },
        },
      ];
    }
    if (status) where.status = status;
    if (ownerId) where.userId = ownerId;

    const orderBy: Prisma.ProjectOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { campaigns: true, knowledgeSources: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: items.map(({ user, _count, ...project }): AdminProjectListItem => ({
        ...project,
        owner: user,
        campaignCount: _count.campaigns,
        knowledgeSourceCount: _count.knowledgeSources,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProject(id: string): Promise<AdminProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        archivedAt: true,
        brandProfile: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { campaigns: true, knowledgeSources: true } },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    const { user, _count, ...rest } = project;

    const [strategies, contents, workflowExecutions] = await Promise.all([
      this.prisma.marketingStrategy.count({
        where: { campaign: { projectId: id } },
      }),
      this.prisma.generatedContent.count({
        where: { campaign: { projectId: id } },
      }),
      this.prisma.workflowExecution.count({
        where: {
          OR: [
            { strategy: { campaign: { projectId: id } } },
            { contentRun: { campaign: { projectId: id } } },
          ],
        },
      }),
    ]);

    return {
      ...rest,
      owner: user,
      summary: {
        campaigns: _count.campaigns,
        knowledgeSources: _count.knowledgeSources,
        strategies,
        contents,
        workflowExecutions,
      },
    };
  }

  async updateProject(id: string, dto: AdminUpdateProjectDto) {
    const existing = await this.findProjectOrFail(id);

    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.brandProfile !== undefined) {
      data.brandProfile = dto.brandProfile as unknown as Prisma.InputJsonValue;
    }

    if (dto.status !== undefined) {
      if (dto.status === existing.status) {
        throw new ConflictException(
          `Project is already ${dto.status.toLowerCase()}`,
        );
      }
      data.status = dto.status;
      data.archivedAt =
        dto.status === ProjectStatus.ARCHIVED ? new Date() : null;
    }

    return this.prisma.project.update({ where: { id }, data });
  }

  private async findProjectOrFail(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true, name: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async deleteProject(id: string) {
    const project = await this.findProjectOrFail(id);

    const [campaignCount, knowledgeSourceCount] = await Promise.all([
      this.prisma.campaign.count({ where: { projectId: id } }),
      this.prisma.knowledgeSource.count({ where: { projectId: id } }),
    ]);

    if (campaignCount > 0 || knowledgeSourceCount > 0) {
      throw new ConflictException(
        `Cannot delete project "${project.name}": it still contains ` +
          `${campaignCount} campaign(s) and ${knowledgeSourceCount} knowledge source(s). ` +
          'Archive the project instead of deleting it.',
      );
    }

    await this.prisma.project.delete({ where: { id } });
    return { id, name: project.name, deleted: true };
  }
}
