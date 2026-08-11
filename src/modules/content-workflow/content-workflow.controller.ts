import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ContentWorkflowService } from './content-workflow.service';
import { QueryContentRunDto } from './dto/query-content-run.dto';
import { MastraRunEventsService } from '../mastra/run-events.service';
import { MASTRA_WORKFLOWS } from '../mastra/mastra.types';

@Controller('campaigns/:campaignId/content-runs')
@UseGuards(AuthGuard)
export class CampaignContentRunController {
  constructor(private readonly service: ContentWorkflowService) {}

  /**
   * 202: queued, not finished. Pass `strategyId` to build the content from a
   * finished strategy run — its campaignStrategy is folded into the workflow
   * input. Every other field is forwarded to Mastra untouched, so the body is
   * intentionally untyped (a DTO here would be stripped by the global
   * whitelist pipe).
   */
  @Post()
  @HttpCode(202)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.start(user.id, campaignId, body);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Query() query: QueryContentRunDto,
  ) {
    return this.service.findAll(user.id, campaignId, query);
  }
}

@Controller('content-runs')
@UseGuards(AuthGuard)
export class ContentRunController {
  constructor(
    private readonly service: ContentWorkflowService,
    private readonly events: MastraRunEventsService,
  ) {}

  @Sse(':id/events')
  eventsForRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Observable<{ data: unknown }> {
    return this.events.stream(MASTRA_WORKFLOWS.content, () =>
      this.service.findOwnedOrFail(user.id, id),
    );
  }

  /**
   * Poll target. Once READY, `output` holds the full workflow payload and the
   * calendar entries are also available as generated content under
   * `GET /campaigns/:campaignId/contents`.
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user.id, id);
  }

  /** Stops a queued, running, or suspended content run. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(user.id, id);
  }

  /**
   * Approves or answers a suspension raised by `requireApproval`, putting the
   * run back on the queue. Body: `{ step?, resumeData }`.
   */
  @Post(':id/resume')
  @HttpCode(202)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.resume(user.id, id, body);
  }
}
