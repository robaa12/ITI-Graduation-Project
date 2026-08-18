import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { AdminContentService } from './admin-content.service';
import { AdminContentQueryDto } from './dto/admin-content-query.dto';

@Controller('admin/contents')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminContentController {
  constructor(private readonly adminContent: AdminContentService) {}

  @Get()
  list(@Query() query: AdminContentQueryDto) {
    return this.adminContent.listContents(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminContent.getContent(id);
  }
}
