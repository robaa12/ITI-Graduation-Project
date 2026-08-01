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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

/** Campaigns always live inside a project, so creating and listing is nested. */
@Controller('projects/:projectId/campaigns')
@UseGuards(AuthGuard)
export class ProjectCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(user.id, projectId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: QueryCampaignsDto,
  ) {
    return this.campaignsService.findAll(user.id, projectId, query);
  }
}

@Controller('campaigns')
@UseGuards(AuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(user.id, id, dto);
  }

  /**
   * Save draft: persists edits and forces the campaign back to DRAFT. Needs at
   * least one field — un-publishing on its own is `POST :id/unpublish`, so a
   * stray empty request can never take a live campaign offline.
   */
  @Put(':id/draft')
  @HttpCode(200)
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.saveDraft(user.id, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.publish(user.id, id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.unpublish(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.remove(user.id, id);
  }
}
