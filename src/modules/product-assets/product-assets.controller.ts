import { BadRequestException, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductAssetsService, type UploadedProductAsset } from './product-assets.service';

@Controller('projects/:projectId/product-assets')
@UseGuards(AuthGuard)
export class ProductAssetsController {
  constructor(private readonly assets: ProductAssetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.assets.list(user.id, projectId);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @UploadedFile() file: UploadedProductAsset | undefined) {
    if (!file) throw new BadRequestException('A product image file is required');
    return this.assets.upload(user.id, projectId, file);
  }

  @Delete(':assetId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Param('assetId', ParseUUIDPipe) assetId: string) {
    await this.assets.remove(user.id, projectId, assetId);
  }
}
