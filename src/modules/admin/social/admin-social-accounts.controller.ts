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
import { AdminSocialAccountsQueryDto } from './dto/admin-social-accounts-query.dto';

@Controller('admin/social/accounts')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminSocialAccountsController {
  constructor(
    private readonly adminSocialAccounts: AdminSocialAccountsService,
  ) {}

  @Get()
  list(@Query() query: AdminSocialAccountsQueryDto) {
    return this.adminSocialAccounts.listAccounts(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminSocialAccounts.getAccount(id);
  }
}
