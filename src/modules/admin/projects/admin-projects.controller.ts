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
import { AdminProjectsService } from './admin-projects.service';
import { AdminProjectsQueryDto } from './dto/admin-projects-query.dto';
import { AdminUpdateProjectDto } from './dto/admin-update-project.dto';

@Controller('admin/projects')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminProjectsController {
  constructor(private readonly adminProjectsService: AdminProjectsService) {}

  @Get()
  list(@Query() query: AdminProjectsQueryDto) {
    return this.adminProjectsService.listProjects(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProjectsService.getProject(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateProjectDto,
  ) {
    return this.adminProjectsService.updateProject(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProjectsService.deleteProject(id);
  }
}
