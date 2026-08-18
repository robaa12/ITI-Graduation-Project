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
import { AdminSocialAccountsService } from './admin-social-accounts.service';
import { AdminSocialConnectionsQueryDto } from './dto/admin-social-connections-query.dto';

@Controller('admin/social/connections')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminSocialConnectionsController {
  constructor(
    private readonly adminSocialAccounts: AdminSocialAccountsService,
  ) {}

  @Get()
  list(@Query() query: AdminSocialConnectionsQueryDto) {
    return this.adminSocialAccounts.listConnections(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSocialAccounts.getConnection(id);
  }
}
