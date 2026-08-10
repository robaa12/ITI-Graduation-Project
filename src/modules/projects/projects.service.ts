import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GeneratedContentStatus,
  Prisma,
  Project,
  ProjectStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { DuplicateProjectDto } from './dto/duplicate-project.dto';
import { FindProjectDto } from './dto/find-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        userId,
      },
    });
  }

  async findAll(userId: string, query: QueryProjectsDto) {
    const where: Prisma.ProjectWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: { select: { campaigns: true } },
        },
      }),
      this.prisma.project.count({ where }),
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

  /**
   * Project detail with its campaigns. The nested list is paginated so a
   * project with many campaigns never loads them all in one response.
   */
  async findOne(userId: string, id: string, query: FindProjectDto) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: { _count: { select: { campaigns: true } } },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: { projectId: id },
      orderBy: { updatedAt: 'desc' },
      skip: (query.campaignsPage - 1) * query.campaignsLimit,
      take: query.campaignsLimit,
      include: { _count: { select: { contents: true } } },
    });

    const { _count, ...rest } = project;
    const total = _count.campaigns;

    return {
      ...rest,
      campaigns: {
        items: campaigns,
        meta: {
          total,
          page: query.campaignsPage,
          limit: query.campaignsLimit,
          totalPages: Math.ceil(total / query.campaignsLimit),
        },
      },
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    await this.findOwnedOrFail(userId, id);

    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.brandProfile !== undefined
          ? { brandProfile: dto.brandProfile as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /** Removes the project together with its campaigns and generated content. */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnedOrFail(userId, id);

    await this.prisma.project.delete({ where: { id } });
  }

  async archive(userId: string, id: string): Promise<Project> {
    const project = await this.findOwnedOrFail(userId, id);

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new ConflictException('Project is already archived');
    }

    return this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  async unarchive(userId: string, id: string): Promise<Project> {
    const project = await this.findOwnedOrFail(userId, id);

    if (project.status === ProjectStatus.ACTIVE) {
      throw new ConflictException('Project is not archived');
    }

    return this.prisma.project.update({
      where: { id },
      data: { status: ProjectStatus.ACTIVE, archivedAt: null },
    });
  }

  /**
   * Deep-copies a project with all of its campaigns. Copied campaigns always
   * start as drafts so the duplicate never re-publishes anything by itself,
   * and only settled content comes along — see the `contents` filter below.
   */
  async duplicate(userId: string, id: string, dto: DuplicateProjectDto) {
    const source = await this.prisma.project.findFirst({
      where: { id, userId },
      include: {
        campaigns: {
          include: {
            // A PENDING row's job belongs to the original row and will never
            // write to the copy, so copying one strands it PENDING forever; a
            // FAILED row is an error record, not content worth carrying over.
            contents: { where: { status: GeneratedContentStatus.READY } },
          },
        },
      },
    });

    if (!source) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return this.prisma.project.create({
      data: {
        userId,
        name: dto.name ?? `${source.name} (Copy)`,
        description: source.description,
        campaigns: {
          create: source.campaigns.map((campaign) => ({
            name: campaign.name,
            description: campaign.description,
            objective: campaign.objective,
            audience: campaign.audience,
            tone: campaign.tone,
            channels: campaign.channels,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            ...(dto.includeGeneratedContent
              ? {
                  contents: {
                    create: campaign.contents.map((content) => ({
                      type: content.type,
                      title: content.title,
                      body: content.body,
                      payload: content.payload ?? Prisma.DbNull,
                      format: content.format,
                      prompt: content.prompt,
                      model: content.model,
                      // `status` and `error` are left at their defaults: only
                      // READY rows reach here, so the copy is READY with no
                      // error, and `version` restarts at 1 because the copy
                      // has been regenerated zero times of its own.
                      //
                      // `isEdited` is carried over on purpose — it describes
                      // the text, and the text still contains those human
                      // edits. Resetting it would claim the copy is untouched
                      // agent output and let a regenerate silently discard
                      // work the flag exists to protect.
                      isEdited: content.isEdited,
                    })),
                  },
                }
              : {}),
          })),
        },
      },
      include: {
        campaigns: { include: { _count: { select: { contents: true } } } },
      },
    });
  }

  /**
   * Shared ownership check: resolves the project only when it belongs to the
   * given user, otherwise throws 404 so project ids stay non-enumerable.
   */
  async findOwnedOrFail(userId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }
}
