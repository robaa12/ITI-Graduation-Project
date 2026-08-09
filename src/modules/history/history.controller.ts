import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { WorkflowRunStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ProjectsService } from '../projects/projects.service';

type HistoryStatus = 'running' | 'success' | 'failed' | 'suspended';

function toHistoryStatus(status: WorkflowRunStatus): HistoryStatus {
  if (status === WorkflowRunStatus.READY) return 'success';
  if (status === WorkflowRunStatus.FAILED) return 'failed';
  if (status === WorkflowRunStatus.SUSPENDED) return 'suspended';
  return 'running';
}

/**
 * Read-only timeline for the frontend's existing history UI. A campaign is
 * the persisted replacement for the former file-backed "chat" concept.
 */
@Controller()
@UseGuards(AuthGuard)
export class HistoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get('campaigns/:campaignId/history')
  async campaignHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    await this.campaigns.findOwnedOrFail(user.id, campaignId);
    return this.historyForCampaign(campaignId);
  }

  @Get('projects/:projectId/history')
  async projectHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.projects.findOwnedOrFail(user.id, projectId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { projectId },
      select: { id: true },
    });
    const histories = await Promise.all(
      campaigns.map((campaign) => this.historyForCampaign(campaign.id)),
    );
    return histories.flat().toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async historyForCampaign(campaignId: string) {
    const [strategies, contentRuns] = await this.prisma.$transaction([
      this.prisma.marketingStrategy.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, output: true, error: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.campaignContentRun.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, output: true, error: true, createdAt: true, updatedAt: true },
      }),
    ]);

    return [
      ...strategies.map((run) => ({
        id: run.id,
        kind: 'strategy' as const,
        status: toHistoryStatus(run.status),
        result: run.output,
        error: run.error,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      })),
      ...contentRuns.map((run) => ({
        id: run.id,
        kind: 'content' as const,
        status: toHistoryStatus(run.status),
        result: run.output,
        error: run.error,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      })),
    ].toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
