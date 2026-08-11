import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateSocialPublicationDto } from './dto/create-social-publication.dto';
import { QuerySocialPublicationsDto } from './dto/query-social-publications.dto';
import { SocialPublicationsService } from './social-publications.service';

@Controller()
@UseGuards(AuthGuard)
export class SocialPublicationsController {
  constructor(private readonly publications: SocialPublicationsService) {}

  @Get('publications')
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySocialPublicationsDto,
  ) {
    return this.publications.listForUser(user.id, query);
  }

  @Post('contents/:contentId/publications')
  @HttpCode(202)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() dto: CreateSocialPublicationDto,
  ) {
    return this.publications.create(user.id, contentId, dto);
  }

  @Get('contents/:contentId/publications')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ) {
    return this.publications.listForContent(user.id, contentId);
  }

  @Get('publications/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publications.findOne(user.id, id);
  }

  @Delete('publications/:id')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publications.cancel(user.id, id);
  }

  @Post('publications/:id/retry')
  @HttpCode(202)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publications.retry(user.id, id);
  }
}
