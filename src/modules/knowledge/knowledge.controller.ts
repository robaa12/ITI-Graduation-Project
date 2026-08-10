import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { KnowledgeService } from './knowledge.service';
import { AskKnowledgeDto, CreateDocumentSourceDto, CreateSocialSourceDto, CreateWebsiteSourceDto } from './dto/create-knowledge-source.dto';

@Controller('projects/:projectId/knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('sources')
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) { return this.knowledge.list(user.id, projectId); }

  @Post('sources/website') @HttpCode(202)
  website(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateWebsiteSourceDto) { return this.knowledge.addWebsite(user.id, projectId, dto); }

  @Post('sources/document') @HttpCode(202)
  document(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateDocumentSourceDto) { return this.knowledge.addDocument(user.id, projectId, dto); }

  @Post('sources/social-posts') @HttpCode(202)
  socialPosts(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateSocialSourceDto) { return this.knowledge.addSocialPosts(user.id, projectId, dto); }

  @Post('sources/:sourceId/refresh') @HttpCode(202)
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Param('sourceId', ParseUUIDPipe) sourceId: string) { return this.knowledge.refresh(user.id, projectId, sourceId); }

  @Post('reindex') @HttpCode(202)
  reindexAll(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) { return this.knowledge.reindexAll(user.id, projectId); }

  @Post('ask')
  ask(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: AskKnowledgeDto) { return this.knowledge.ask(user.id, projectId, dto.query); }

  @Delete('sources/:sourceId') @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Param('sourceId', ParseUUIDPipe) sourceId: string) { await this.knowledge.remove(user.id, projectId, sourceId); }
}
