import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateSocialAccountDto } from './dto/update-social-account.dto';
import { MetaConnectorsService } from './meta-connectors.service';

@Controller('connectors/meta')
export class MetaConnectorsController {
  constructor(private readonly connectors: MetaConnectorsService) {}

  @Get('oauth/callback')
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      await this.connectors.completeOAuth({ state, code, error });
      response.redirect(this.connectors.getFrontendRedirectUrl('connected'));
    } catch {
      response.redirect(this.connectors.getFrontendRedirectUrl('error'));
    }
  }

  @Get('status')
  @UseGuards(AuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.connectors.status(user.id);
  }

  @Post('oauth/start')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  startOAuth(@CurrentUser() user: AuthenticatedUser) {
    return this.connectors.startOAuth(user.id);
  }

  @Post('sync')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.connectors.sync(user.id);
  }

  @Patch('accounts/:id')
  @UseGuards(AuthGuard)
  updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSocialAccountDto,
  ) {
    return this.connectors.updateAccountSelection(user.id, id, dto.selected);
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(AuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.connectors.disconnect(user.id);
  }
}
