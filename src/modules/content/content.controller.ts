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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { ExportedFile } from './content-export.service';
import { ContentService } from './content.service';
import { ExportContentDto } from './dto/export-content.dto';
import { GenerateContentDto } from './dto/generate-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { RegenerateContentDto } from './dto/regenerate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

function sendFile(res: Response, file: ExportedFile): void {
  res
    .status(200)
    .setHeader('Content-Type', file.contentType)
    .setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    .send(file.body);
}

/** Generated content is always produced for, and listed under, a campaign. */
@Controller('campaigns/:campaignId/contents')
@UseGuards(AuthGuard)
export class CampaignContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('generate')
  @HttpCode(201)
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: GenerateContentDto,
  ) {
    return this.contentService.generate(user.id, campaignId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: QueryContentDto,
  ) {
    return this.contentService.findAll(user.id, campaignId, query);
  }

  @Get('export')
  async exportAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: ExportContentDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.contentService.exportCampaign(
      user.id,
      campaignId,
      query.format,
    );

    sendFile(res, file);
  }
}

@Controller('contents')
@UseGuards(AuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contentService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.contentService.update(user.id, id, dto);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegenerateContentDto,
  ) {
    return this.contentService.regenerate(user.id, id, dto);
  }

  @Get(':id/export')
  async exportOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportContentDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.contentService.exportOne(user.id, id, query.format);

    sendFile(res, file);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contentService.remove(user.id, id);
  }
}
