import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}
