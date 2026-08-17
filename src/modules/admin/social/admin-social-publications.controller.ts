import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { AdminSocialPublicationsService } from './admin-social-publications.service';
import { AdminSocialPublicationsQueryDto } from './dto/admin-social-publications-query.dto';
import { AdminUpdateSocialPublicationDto } from './dto/admin-update-social-publication.dto';

@Controller('admin/social/publications')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminSocialPublicationsController {
  constructor(
    private readonly adminSocialPublications: AdminSocialPublicationsService,
  ) {}

  @Get()
  list(@Query() query: AdminSocialPublicationsQueryDto) {
    return this.adminSocialPublications.listPublications(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSocialPublications.getPublication(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSocialPublicationDto,
  ) {
    return this.adminSocialPublications.updatePublication(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSocialPublications.deletePublication(id);
  }
}
