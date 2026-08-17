import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkflowAccountingStatus,
  WorkflowRunStatus,
  type WorkflowExecution,
} from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowAccountingService } from '../../workflow-accounting/workflow-accounting.service';
import { AdminWorkflowExecutionsQueryDto } from './dto/admin-workflow-executions-query.dto';
import type {
  AdminWorkflowAgentItem,
  AdminWorkflowCampaignRef,
  AdminWorkflowExecutionDetail,
  AdminWorkflowExecutionListItem,
  AdminWorkflowProjectRef,
  AdminWorkflowStatistics,
  AdminWorkflowUserRef,
} from './types/admin-workflows.types';

/** A workflow execution row plus the campaign/project/user it links to. */
type WorkflowExecutionWithRefs = WorkflowExecution & {
  strategy: WorkflowStrategyRef | null;
  contentRun: WorkflowContentRunRef | null;
};

interface WorkflowStrategyRef {
  campaign: WorkflowCampaignRef;
}

interface WorkflowContentRunRef {
  campaign: WorkflowCampaignRef;
}

interface WorkflowCampaignRef {
  id: string;
  name: string;
  project: WorkflowProjectRef;
}

interface WorkflowProjectRef {
  id: string;
  name: string;
  user: WorkflowUserRef;
}

interface WorkflowUserRef {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class AdminWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: WorkflowAccountingService,
  ) {}

  async listExecutions(query: AdminWorkflowExecutionsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      kind,
      status,
      accountingStatus,
      userId,
      projectId,
      campaignId,
      from,
      to,
      search,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.WorkflowExecutionWhereInput = {};
    if (kind) where.kind = kind;
    if (status) where.status = status;
    if (accountingStatus) where.accountingStatus = accountingStatus;
    const relationFilters: Prisma.WorkflowExecutionWhereInput[] = [];
    if (campaignId) {
      relationFilters.push({
        OR: [{ strategy: { campaignId } }, { contentRun: { campaignId } }],
      });
    }
    if (projectId) {
      relationFilters.push({
        OR: [
          { strategy: { campaign: { projectId } } },
          { contentRun: { campaign: { projectId } } },
        ],
      });
    }
    if (userId) {
      relationFilters.push({
        OR: [
          { strategy: { campaign: { project: { userId } } } },
          { contentRun: { campaign: { project: { userId } } } },
        ],
      });
    }
    if (relationFilters.length > 0) where.AND = relationFilters;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.mastraRunId = {
        contains: normalizedSearch,
        mode: 'insensitive',
      };
    }

    const orderBy: Prisma.WorkflowExecutionOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.executionSelect,
          ...this.executionRefsSelect,
        },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return {
      data: items.map((item): AdminWorkflowExecutionListItem =>
        this.presentListItem(item as WorkflowExecutionWithRefs),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  protected executionSelect = {
    id: true,
    mastraRunId: true,
    workflowId: true,
    kind: true,
    status: true,
    accountingStatus: true,
    inputTokens: true,
    outputTokens: true,
    totalTokens: true,
    estimatedCost: true,
    costUnit: true,
    modelBreakdown: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
    updatedAt: true,
    usageCollectedAt: true,
  } satisfies Prisma.WorkflowExecutionSelect;

  protected campaignRefSelect = {
    select: {
      id: true,
      name: true,
      project: {
        select: {
          id: true,
          name: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  } as const;

  protected executionRefsSelect = {
    strategy: {
      select: {
        campaign: this.campaignRefSelect,
      },
    },
    contentRun: {
      select: {
        campaign: this.campaignRefSelect,
      },
    },
  } as const;

  async getExecution(id: string): Promise<AdminWorkflowExecutionDetail> {
    const execution = await this.findExecutionOrFail(id, {
      ...this.executionSelect,
      strategyId: true,
      contentRunId: true,
      strategy: {
        select: {
          input: true,
          output: true,
          suspendPayload: true,
          campaign: this.campaignRefSelect,
        },
      },
      contentRun: {
        select: {
          input: true,
          output: true,
          suspendPayload: true,
          campaign: this.campaignRefSelect,
        },
      },
    });

    // Read-repair stale accounting for this single execution before presenting
    // it, matching how the strategy detail endpoint keeps usage fresh. If the
    // execution was deleted between the lookup and the reconciliation, the
    // reconcile query returns nothing — surface a 404 instead of stale data.
    const [reconciled] = await this.accounting.reconcileForPresentation([
      execution,
    ]);
    if (!reconciled) {
      throw new NotFoundException(`Workflow execution with ID ${id} not found`);
    }
    const refreshed = { ...execution, ...reconciled };

    const parent = execution.strategy ?? execution.contentRun;

    return {
      ...this.presentListItem(refreshed),
      strategyId: execution.strategyId,
      contentRunId: execution.contentRunId,
      workflowInput: parent?.input ?? null,
      workflowOutput: parent?.output ?? null,
      suspendPayload: parent?.suspendPayload ?? null,
      usageCollectedAt: refreshed.usageCollectedAt,
      updatedAt: refreshed.updatedAt,
      agents: parseModelBreakdown(refreshed.modelBreakdown),
    };
  }

  async getExecutionAgents(id: string) {
    const execution = await this.findExecutionOrFail(id, {
      modelBreakdown: true,
    });

    const agents = parseModelBreakdown(execution.modelBreakdown);
    return { data: agents, meta: { total: agents.length } };
  }

  /** Loads one execution or throws a consistent 404. */
  private async findExecutionOrFail<T extends Prisma.WorkflowExecutionSelect>(
    id: string,
    select: T,
  ) {
    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id },
      select,
    });

    if (!execution) {
      throw new NotFoundException(`Workflow execution with ID ${id} not found`);
    }

    return execution;
  }

  async getStatistics(): Promise<AdminWorkflowStatistics> {
    const [
      totalExecutions,
      statusGroups,
      kindGroups,
      workflowGroups,
      tokenAgg,
      costAgg,
      costByWorkflow,
      durationRows,
      breakdownRows,
    ] = await Promise.all([
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.workflowExecution.groupBy({
        by: ['kind'],
        _count: { _all: true },
      }),
      this.prisma.workflowExecution.groupBy({
        by: ['workflowId'],
        _count: { _all: true },
      }),
      this.prisma.workflowExecution.aggregate({
        _sum: { totalTokens: true },
      }),
      this.prisma.workflowExecution.aggregate({
        _sum: { estimatedCost: true },
      }),
      this.prisma.workflowExecution.groupBy({
        by: ['workflowId'],
        _sum: { estimatedCost: true },
      }),
      this.prisma.workflowExecution.findMany({
        where: { startedAt: { not: null }, finishedAt: { not: null } },
        select: { startedAt: true, finishedAt: true },
      }),
      this.prisma.workflowExecution.findMany({
        where: { modelBreakdown: { not: Prisma.DbNull } },
        select: { modelBreakdown: true },
      }),
    ]);

    const countFor = (status: WorkflowRunStatus) =>
      statusGroups.find((group) => group.status === status)?._count._all ?? 0;

    const totalMs = durationRows.reduce(
      (sum, row) =>
        sum +
        (row.finishedAt as Date).getTime() -
        (row.startedAt as Date).getTime(),
      0,
    );

    const totalCostUsd = costAgg._sum.estimatedCost
      ? Number(costAgg._sum.estimatedCost)
      : null;

    return {
      totalExecutions,
      byWorkflow: workflowGroups.map((group) => ({
        workflowId: group.workflowId,
        count: group._count._all,
      })),
      byKind: kindGroups.map((group) => ({
        kind: group.kind,
        count: group._count._all,
      })),
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      successful: countFor(WorkflowRunStatus.READY),
      failed: countFor(WorkflowRunStatus.FAILED),
      canceled: countFor(WorkflowRunStatus.CANCELED),
      pending:
        countFor(WorkflowRunStatus.PENDING) +
        countFor(WorkflowRunStatus.RUNNING) +
        countFor(WorkflowRunStatus.SUSPENDED),
      totalTokens: tokenAgg._sum.totalTokens ?? 0,
      totalCostUsd,
      averageDurationMs: durationRows.length
        ? Math.round(totalMs / durationRows.length)
        : null,
      averageCostUsd:
        totalCostUsd != null && totalExecutions > 0
          ? totalCostUsd / totalExecutions
          : null,
      costByWorkflow: costByWorkflow.map((group) => ({
        workflowId: group.workflowId,
        estimatedCostUsd: group._sum.estimatedCost
          ? Number(group._sum.estimatedCost)
          : null,
      })),
      byModel: aggregateModels(breakdownRows),
    };
  }

  protected presentListItem(
    execution: WorkflowExecutionWithRefs,
  ): AdminWorkflowExecutionListItem {
    const { campaign, project, user } = this.resolveRefs(execution);
    return {
      id: execution.id,
      mastraRunId: execution.mastraRunId,
      workflowId: execution.workflowId,
      kind: execution.kind,
      status: execution.status,
      accountingStatus: execution.accountingStatus,
      inputTokens: execution.inputTokens,
      outputTokens: execution.outputTokens,
      totalTokens: execution.totalTokens,
      estimatedCostUsd: toCostUsd(execution),
      costUnit: execution.costUnit,
      agentCount: modelBreakdownLength(execution.modelBreakdown),
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      durationMs: toDurationMs(execution.startedAt, execution.finishedAt),
      createdAt: execution.createdAt,
      campaign,
      project,
      user,
    };
  }

  protected resolveRefs(execution: WorkflowExecutionWithRefs): {
    campaign: AdminWorkflowCampaignRef | null;
    project: AdminWorkflowProjectRef | null;
    user: AdminWorkflowUserRef | null;
  } {
    const parent = execution.strategy ?? execution.contentRun;
    const campaign = parent?.campaign ?? null;
    const project = campaign?.project ?? null;
    return {
      campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
      project: project ? { id: project.id, name: project.name } : null,
      user: project?.user
        ? {
            id: project.user.id,
            name: project.user.name,
            email: project.user.email,
          }
        : null,
    };
  }
}

/** USD cost when accounting is READY and priced in USD, else null. */
export function toCostUsd(execution: {
  accountingStatus: WorkflowAccountingStatus;
  costUnit: string | null;
  estimatedCost: Prisma.Decimal | null;
}): number | null {
  if (
    execution.accountingStatus !== WorkflowAccountingStatus.READY ||
    execution.costUnit !== 'USD' ||
    execution.estimatedCost == null
  ) {
    return null;
  }
  return Number(execution.estimatedCost);
}

/** Wall-clock duration in milliseconds, or null while the run is unfinished. */
export function toDurationMs(
  startedAt: Date | null,
  finishedAt: Date | null,
): number | null {
  if (!startedAt || !finishedAt) return null;
  return finishedAt.getTime() - startedAt.getTime();
}

/** Number of per-model usage entries persisted in the breakdown. */
export function modelBreakdownLength(
  breakdown: Prisma.JsonValue | null,
): number {
  return Array.isArray(breakdown) ? breakdown.length : 0;
}

/**
 * Parses the persisted `modelBreakdown` JSON into typed per-model usage
 * entries. Malformed or non-array values yield an empty list rather than a
 * crash, and unpriced entries surface a null cost instead of a fabricated one.
 */
export function parseModelBreakdown(
  breakdown: Prisma.JsonValue | null,
): AdminWorkflowAgentItem[] {
  if (!Array.isArray(breakdown)) return [];

  return breakdown.flatMap((entry): AdminWorkflowAgentItem[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const item = entry as Record<string, unknown>;
    const provider = item.provider;
    const model = item.model;
    if (typeof provider !== 'string' || typeof model !== 'string') {
      return [];
    }
    const costUnit = typeof item.costUnit === 'string' ? item.costUnit : null;
    const estimatedCost = item.estimatedCost;
    return [
      {
        provider,
        model,
        inputTokens: numberOrZero(item.inputTokens),
        outputTokens: numberOrZero(item.outputTokens),
        totalTokens: numberOrZero(item.totalTokens),
        estimatedCostUsd:
          costUnit === 'USD' && typeof estimatedCost === 'number'
            ? estimatedCost
            : null,
        costUnit,
      },
    ];
  });
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Aggregates persisted per-model usage across executions: execution count,
 * total tokens, and summed USD cost (null when no entry was priced).
 */
function aggregateModels(
  rows: Array<{ modelBreakdown: Prisma.JsonValue | null }>,
) {
  const totals = new Map<
    string,
    {
      provider: string;
      model: string;
      executionCount: number;
      totalTokens: number;
      cost: number;
      priced: boolean;
    }
  >();

  for (const row of rows) {
    for (const agent of parseModelBreakdown(row.modelBreakdown)) {
      const key = `${agent.provider}::${agent.model}`;
      const current = totals.get(key) ?? {
        provider: agent.provider,
        model: agent.model,
        executionCount: 0,
        totalTokens: 0,
        cost: 0,
        priced: false,
      };
      current.executionCount += 1;
      current.totalTokens += agent.totalTokens;
      if (agent.estimatedCostUsd != null) {
        current.cost += agent.estimatedCostUsd;
        current.priced = true;
      }
      totals.set(key, current);
    }
  }

  return [...totals.values()].map((entry) => ({
    provider: entry.provider,
    model: entry.model,
    executionCount: entry.executionCount,
    totalTokens: entry.totalTokens,
    estimatedCostUsd: entry.priced ? entry.cost : null,
  }));
}
