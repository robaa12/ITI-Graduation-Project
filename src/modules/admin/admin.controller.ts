import { Controller, Get, UseGuards } from '@nestjs/common';

import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  @Get('health')
  health(): object {
    return {
      success: true,
      message: 'Admin access granted',
    };
  }
}
