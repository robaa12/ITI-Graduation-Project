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
import { AdminCampaignsService } from './admin-campaigns.service';
import { AdminCampaignsQueryDto } from './dto/admin-campaigns-query.dto';
import { AdminUpdateCampaignDto } from './dto/admin-update-campaign.dto';
import { AdminCampaignContentsQueryDto } from './dto/admin-campaign-contents-query.dto';
import { AdminCampaignPublicationsQueryDto } from './dto/admin-campaign-publications-query.dto';
import { AdminCampaignStrategiesQueryDto } from './dto/admin-campaign-strategies-query.dto';
import { AdminCampaignContentRunsQueryDto } from './dto/admin-campaign-content-runs-query.dto';

@Controller('admin/campaigns')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminCampaignsController {
  constructor(private readonly adminCampaigns: AdminCampaignsService) {}

  @Get()
  list(@Query() query: AdminCampaignsQueryDto) {
    return this.adminCampaigns.listCampaigns(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminCampaigns.getCampaign(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateCampaignDto,
  ) {
    return this.adminCampaigns.updateCampaign(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminCampaigns.deleteCampaign(id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminCampaigns.publishCampaign(id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminCampaigns.unpublishCampaign(id);
  }

  @Get(':id/contents')
  listContents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminCampaignContentsQueryDto,
  ) {
    return this.adminCampaigns.listCampaignContents(id, query);
  }

  @Get(':id/publications')
  listPublications(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminCampaignPublicationsQueryDto,
  ) {
    return this.adminCampaigns.listCampaignPublications(id, query);
  }

  @Get(':id/strategies')
  listStrategies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminCampaignStrategiesQueryDto,
  ) {
    return this.adminCampaigns.listCampaignStrategies(id, query);
  }

  @Get(':id/content-runs')
  listContentRuns(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminCampaignContentRunsQueryDto,
  ) {
    return this.adminCampaigns.listCampaignContentRuns(id, query);
  }
}
