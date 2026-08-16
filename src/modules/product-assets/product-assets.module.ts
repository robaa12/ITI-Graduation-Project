import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProductAssetsController } from './product-assets.controller';
import { ProductAssetsService } from './product-assets.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ProductAssetsController],
  providers: [ProductAssetsService],
  exports: [ProductAssetsService],
})
export class ProductAssetsModule {}
