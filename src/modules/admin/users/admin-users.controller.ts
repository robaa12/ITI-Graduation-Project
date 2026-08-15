import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';

import { AdminGuard } from '../../admin/admin.guard';
import { AdminUsersService } from './admin-users.service';
import type { QueryUsersDto } from './dto/query-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { ChangeUserRoleDto } from './dto/change-user-role.dto';

import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  async list(@CurrentUser() admin, @Query() query: QueryUsersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async get(@CurrentUser() admin, @Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  async update(
    @CurrentUser() admin,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/role')
  async changeRole(
    @CurrentUser() admin,
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return this.service.changeRole(id, dto);
  }
}
