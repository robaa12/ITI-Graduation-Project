import type {
  WorkflowAccountingStatus,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';

/** Owning user reference on workflow responses. */
export interface AdminWorkflowUserRef {
  id: string;
  name: string;
  email: string;
}

/** Owning project reference on workflow responses. */
export interface AdminWorkflowProjectRef {
  id: string;
  name: string;
}

/** Owning campaign reference on workflow responses. */
export interface AdminWorkflowCampaignRef {
  id: string;
  name: string;
}

/** One row of the admin workflow execution listing. */
export interface AdminWorkflowExecutionListItem {
  id: string;
  mastraRunId: string;
  workflowId: string;
  kind: WorkflowExecutionKind;
  status: WorkflowRunStatus;
  accountingStatus: WorkflowAccountingStatus;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  costUnit: string | null;
  agentCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  user: AdminWorkflowUserRef | null;
  project: AdminWorkflowProjectRef | null;
  campaign: AdminWorkflowCampaignRef | null;
}
/** Full workflow execution view: metadata, refs, persisted input/output. */
export interface AdminWorkflowExecutionDetail extends AdminWorkflowExecutionListItem {
  strategyId: string | null;
  contentRunId: string | null;
  /** Workflow input persisted on the parent strategy/content run. */
  workflowInput: unknown;
  /** Final workflow output, present once the run is READY. */
  workflowOutput: unknown;
  suspendPayload: unknown;
  usageCollectedAt: Date | null;
  updatedAt: Date;
  /** Per-model usage entries in their persisted (Mastra) order. */
  agents: AdminWorkflowAgentItem[];
}

/**
 * Persisted per-model usage within one workflow execution. Agent step
 * input/output is not persisted, so this is the closest representation of
 * per-agent token usage and cost available from the database.
 */
export interface AdminWorkflowAgentItem {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  costUnit: string | null;
}

/** Aggregate workflow statistics for the admin dashboard. */
export interface AdminWorkflowStatistics {
  totalExecutions: number;
  byWorkflow: Array<{ workflowId: string; count: number }>;
  byKind: Array<{ kind: WorkflowExecutionKind; count: number }>;
  byStatus: Array<{ status: WorkflowRunStatus; count: number }>;
  successful: number;
  failed: number;
  canceled: number;
  pending: number;
  totalTokens: number;
  totalCostUsd: number | null;
  averageDurationMs: number | null;
  averageCostUsd: number | null;
  costByWorkflow: Array<{
    workflowId: string;
    estimatedCostUsd: number | null;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    executionCount: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
  }>;
}
