import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { KnowledgeSourceStatus, KnowledgeSourceType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { MastraClient } from '../mastra/mastra.client';
import { KNOWLEDGE_QUEUE, KnowledgeIndexJob } from './knowledge.queue';
import { WebsiteCrawlerService } from './website-crawler.service';
import { assertPublicHostname } from './url-safety';
import type { UploadedDocumentFile } from './document-extractor';
import {
  CreateDocumentSourceDto,
  CreateSocialSourceDto,
  CreateWebsiteSourceDto,
} from './dto/create-knowledge-source.dto';

// Storefront homepages routinely include large product/catalog markup. Allow a
// bounded HTML response, then cap the extracted text before it reaches the
// embedding queue so one website cannot dominate a project's knowledge index.
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly mastra: MastraClient,
    private readonly websiteCrawler: WebsiteCrawlerService,
    @InjectQueue(KNOWLEDGE_QUEUE) private readonly queue: Queue<KnowledgeIndexJob>,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projects.findOwnedOrFail(userId, projectId);
    const sources = await this.prisma.knowledgeSource.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, type: true, status: true, name: true, url: true,
        metadata: true, error: true, indexedAt: true, createdAt: true, updatedAt: true,
        _count: { select: { pages: true } },
      },
    });
    return sources.map((source) => ({ ...source, freshness: sourceFreshness(source) }));
  }

  async addWebsite(userId: string, projectId: string, dto: CreateWebsiteSourceDto) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    const url = await this.validateWebsiteUrl(dto.url);
    const source = await this.prisma.knowledgeSource.create({
      data: {
        projectId, type: KnowledgeSourceType.WEBSITE,
        name: dto.name?.trim() || new URL(url).hostname,
        url,
      },
    });
    await this.enqueue(source.id);
    return source;
  }

  async ask(userId: string, projectId: string, query: string) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    return this.mastra.queryProjectKnowledge(
      projectId,
      await this.readySourceIds(projectId),
      query.trim(),
    );
  }

  async addDocument(userId: string, projectId: string, dto: CreateDocumentSourceDto) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Document content cannot be empty');
    const source = await this.prisma.knowledgeSource.create({
      data: { projectId, type: KnowledgeSourceType.DOCUMENT, name: dto.name.trim(), content },
    });
    await this.enqueue(source.id);
    return source;
  }

  async addUploadedDocument(
    userId: string,
    projectId: string,
    file: UploadedDocumentFile,
    content: string,
  ) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    const source = await this.prisma.knowledgeSource.create({
      data: {
        projectId,
        type: KnowledgeSourceType.DOCUMENT,
        name: file.originalname.slice(0, 160),
        content,
        metadata: {
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    await this.enqueue(source.id);
    return source;
  }

  /** The Meta OAuth worker supplies posts only after a user-authorized sync. */
  async addSocialPosts(userId: string, projectId: string, dto: CreateSocialSourceDto) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    const posts = dto.posts.filter((post) => typeof post === 'string' && post.trim()).slice(0, 100);
    if (posts.length === 0) throw new BadRequestException('At least one official social post is required');
    const source = await this.prisma.knowledgeSource.create({
      data: {
        projectId,
        type: dto.platform === 'facebook' ? KnowledgeSourceType.FACEBOOK : KnowledgeSourceType.INSTAGRAM,
        name: dto.accountName.trim(), url: dto.profileUrl,
        content: posts.join('\n\n---\n\n'),
        metadata: { postCount: posts.length },
      },
    });
    await this.enqueue(source.id);
    return source;
  }

  async refresh(userId: string, projectId: string, sourceId: string) {
    this.ensureEnabled();
    const source = await this.findOwned(userId, projectId, sourceId);
    await this.prisma.knowledgeSource.update({
      where: { id: source.id }, data: { status: KnowledgeSourceStatus.PENDING, error: null },
    });
    await this.enqueue(source.id);
    return this.prisma.knowledgeSource.findUniqueOrThrow({ where: { id: source.id } });
  }

  async remove(userId: string, projectId: string, sourceId: string) {
    const source = await this.findOwned(userId, projectId, sourceId);
    await this.prisma.knowledgeSource.delete({ where: { id: source.id } });
    // The system of record is PostgreSQL. A temporarily unavailable vector
    // service must never trap a user behind a resource they asked to delete.
    // Retrieval is source-id scoped, so an orphaned vector cannot be returned.
    try {
      await this.mastra.deleteKnowledgeSource(source.id);
    } catch (error) {
      this.logger.warn(
        `Deleted knowledge source ${source.id} locally but could not remove its vector index: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async index(sourceId: string): Promise<void> {
    const source = await this.prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
    if (!source) return;
    await this.prisma.knowledgeSource.update({
      where: { id: sourceId }, data: { status: KnowledgeSourceStatus.INDEXING, error: null },
    });
    try {
      const website = source.type === KnowledgeSourceType.WEBSITE
        ? await this.websiteCrawler.crawl(source.url!)
        : undefined;
      const content = website ? website.pages.map((page) => page.content).join('\n\n') : source.content;
      if (!content?.trim()) throw new Error('No readable text was available for this source');
      if (website) {
        await this.prisma.$transaction(async (tx) => {
          for (const page of website.pages) {
            await tx.knowledgePage.upsert({
              where: { sourceId_url: { sourceId, url: page.url } },
              create: { sourceId, ...page },
              update: { title: page.title, content: page.content, contentHash: page.contentHash, error: null, crawledAt: new Date() },
            });
          }
          await tx.knowledgePage.deleteMany({ where: { sourceId, url: { notIn: website.pages.map((page) => page.url) } } });
        });
      }
      const pages = website
        ? await this.prisma.knowledgePage.findMany({ where: { sourceId }, orderBy: { url: 'asc' } })
        : [];
      const result = await this.mastra.indexKnowledgeSource({
        projectId: source.projectId, sourceId: source.id, sourceType: source.type,
        name: source.name, url: source.url, content,
        documents: pages.map((page) => ({ pageId: page.id, title: page.title, url: page.url, content: page.content })),
      });
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          content,
          status: KnowledgeSourceStatus.READY,
          indexedAt: new Date(),
          metadata: {
            ...(asObject(source.metadata)), chunkCount: result.chunkCount,
            embeddingProvider: result.embeddingProvider,
            embeddingModel: result.embeddingModel, indexVersion: result.indexVersion,
            contentHash: createHash('sha256').update(content).digest('hex'),
            lastCheckedAt: new Date().toISOString(),
            ...(website ? { pageCount: pages.length, crawlWarnings: website.warnings } : {}),
          },
        },
      });
    } catch (error) {
      await this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: KnowledgeSourceStatus.FAILED, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  private async enqueue(sourceId: string) {
    try {
      // A fixed job id remains reserved after completion in BullMQ, causing a
      // later Refresh to set the database row back to PENDING without adding a
      // new worker job. Let BullMQ assign an id for each requested indexing run.
      await this.queue.add('index', { sourceId }, { attempts: 1 });
    } catch (error) {
      throw new ServiceUnavailableException('The knowledge indexing queue is unavailable');
    }
  }

  async reindexAll(userId: string, projectId: string) {
    this.ensureEnabled();
    await this.projects.findOwnedOrFail(userId, projectId);
    const sources = await this.prisma.knowledgeSource.findMany({ where: { projectId } });
    await this.prisma.knowledgeSource.updateMany({
      where: { projectId },
      data: { status: KnowledgeSourceStatus.PENDING, error: null, indexedAt: null },
    });
    await Promise.all(sources.map((source) => this.enqueue(source.id)));
    return { queued: sources.length };
  }

  private async findOwned(userId: string, projectId: string, sourceId: string) {
    await this.projects.findOwnedOrFail(userId, projectId);
    const source = await this.prisma.knowledgeSource.findFirst({ where: { id: sourceId, projectId } });
    if (!source) throw new NotFoundException(`Knowledge source ${sourceId} not found`);
    return source;
  }

  private ensureEnabled() {
    if (!this.config.get<boolean>('knowledge.enabled')) {
      throw new ServiceUnavailableException('Project knowledge retrieval is not enabled');
    }
  }

  /**
   * This is the authoritative eligibility check for every retrieval entry
   * point. The vector store intentionally does not own source lifecycle.
   */
  private async readySourceIds(projectId: string): Promise<string[]> {
    const sources = await this.prisma.knowledgeSource.findMany({
      where: { projectId, status: KnowledgeSourceStatus.READY },
      select: { id: true },
    });
    return sources.map((source) => source.id);
  }

  private async validateWebsiteUrl(raw: string) {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new BadRequestException('Website URL must be a public http(s) URL');
    }
    try {
      await assertPublicHostname(url.hostname);
    } catch {
      throw new BadRequestException('Website URL must resolve exclusively to public network addresses');
    }
    return url.toString();
  }

}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceFreshness(source: {
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  indexedAt: Date | null;
  updatedAt: Date;
}) {
  if (source.status === KnowledgeSourceStatus.FAILED) {
    return { status: 'error' as const, checkedAt: source.indexedAt };
  }
  if (!source.indexedAt) {
    return { status: 'never-indexed' as const, checkedAt: null };
  }
  const maxAgeDays = source.type === KnowledgeSourceType.WEBSITE
    ? 7
    : source.type === KnowledgeSourceType.DOCUMENT
      ? 90
      : 1;
  const refreshAfter = new Date(
    source.indexedAt.getTime() + maxAgeDays * 24 * 60 * 60 * 1_000,
  );
  return {
    status: refreshAfter <= new Date() ? 'stale' as const : 'fresh' as const,
    checkedAt: source.indexedAt,
    refreshAfter,
    maxAgeDays,
  };
}
