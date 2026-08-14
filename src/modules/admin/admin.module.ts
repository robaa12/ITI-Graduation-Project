import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AuthService } from '../auth/auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    {
      provide: AdminGuard,
      useFactory: (authService: AuthService) => new AdminGuard(authService),
      inject: [AuthService],
    },
  ],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}