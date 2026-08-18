import type { StrategyApprovalStatus, WorkflowRunStatus } from '@prisma/client';

/** Owning campaign reference on strategy responses. */
export interface AdminStrategyCampaignRef {
  id: string;
  name: string;
}

/** Owning project reference on strategy responses. */
export interface AdminStrategyProjectRef {
  id: string;
  name: string;
}

/** Owning user reference on strategy responses. */
export interface AdminStrategyUserRef {
  id: string;
  name: string;
  email: string;
}

/** One row of the admin strategy listing. */
export interface AdminStrategyListItem {
  id: string;
  runId: string | null;
  status: WorkflowRunStatus;
  approvalStatus: StrategyApprovalStatus;
  error: string | null;
  reviewedAt: Date | null;
  reviewerName: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  campaign: AdminStrategyCampaignRef | null;
  project: AdminStrategyProjectRef | null;
  user: AdminStrategyUserRef | null;
  executionCount: number;
}

/** Full strategy view including persisted workflow input/output. */
export interface AdminStrategyDetail extends AdminStrategyListItem {
  input: unknown;
  output: unknown;
  suspendPayload: unknown;
  pendingRevision: unknown;
  reviewEventCount: number;
}

/** One immutable review decision on a strategy. */
export interface AdminStrategyReviewEvent {
  id: string;
  action: StrategyApprovalStatus;
  note: string | null;
  reviewerId: string;
  reviewerName: string;
  createdAt: Date;
}
