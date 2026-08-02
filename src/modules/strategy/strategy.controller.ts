import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { QueryStrategyDto } from './dto/query-strategy.dto';
import { StrategyService } from './strategy.service';

/** A strategy run always belongs to the campaign it was started from. */
@Controller('campaigns/:campaignId/strategy')
@UseGuards(AuthGuard)
export class CampaignStrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  /**
   * 202: the run is queued, not finished. The response carries `runId` and
   * `campaignId` so the client can correlate it immediately, then polls
   * `GET /strategies/:id` until the status leaves PENDING/RUNNING.
   *
   * The body is deliberately untyped — the Mastra workflow owns the input
   * schema, so whatever the client sends is forwarded verbatim and validated
   * there. A body typed as a DTO here would be stripped by the global
   * whitelist pipe.
   */
  @Post()
  @HttpCode(202)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.strategyService.start(user.id, campaignId, input);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: QueryStrategyDto,
  ) {
    return this.strategyService.findAll(user.id, campaignId, query);
  }
}

@Controller('strategies')
@UseGuards(AuthGuard)
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  /** Poll target: returns the row, including `output` once it is READY. */
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.strategyService.findOne(user.id, id);
  }

  /**
   * Answers a suspension and puts the run back on the queue. 202 for the same
   * reason as starting one: the remaining steps still take minutes.
   *
   * Body: `{ step?, resumeData }`. `step` may be omitted when the run is
   * waiting on a single step; `suspendPayload` on the row says what it is.
   */
  @Post(':id/resume')
  @HttpCode(202)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.strategyService.resume(user.id, id, body);
  }
}
