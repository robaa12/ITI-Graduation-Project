import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { AdminKnowledgeService } from './admin-knowledge.service';
import { AdminKnowledgeSourcesQueryDto } from './dto/admin-knowledge-sources-query.dto';
import { AdminKnowledgePagesQueryDto } from './dto/admin-knowledge-pages-query.dto';
import { AdminCreateKnowledgeSourceDto } from './dto/admin-create-knowledge-source.dto';
import { AdminUpdateKnowledgeSourceDto } from './dto/admin-update-knowledge-source.dto';

@Controller('admin/knowledge')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminKnowledgeController {
  constructor(private readonly adminKnowledge: AdminKnowledgeService) {}

  @Get('sources')
  listSources(@Query() query: AdminKnowledgeSourcesQueryDto) {
    return this.adminKnowledge.listSources(query);
  }

  @Get('sources/:id')
  getSource(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminKnowledge.getSource(id);
  }

  @Get('pages')
  listPages(@Query() query: AdminKnowledgePagesQueryDto) {
    return this.adminKnowledge.listPages(query);
  }

  @Get('pages/:id')
  getPage(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminKnowledge.getPage(id);
  }

  @Post('sources')
  @HttpCode(202)
  createSource(@Body() dto: AdminCreateKnowledgeSourceDto) {
    return this.adminKnowledge.createSource(dto);
  }

  @Patch('sources/:id')
  updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateKnowledgeSourceDto,
  ) {
    return this.adminKnowledge.updateSource(id, dto);
  }

  @Delete('sources/:id')
  removeSource(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminKnowledge.deleteSource(id);
  }

  @Post('sources/:id/refresh')
  @HttpCode(202)
  refreshSource(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminKnowledge.refreshSource(id);
  }
}
