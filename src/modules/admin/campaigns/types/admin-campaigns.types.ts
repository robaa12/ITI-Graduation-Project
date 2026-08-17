import type {
  CampaignStatus,
  ContentFormat,
  GeneratedContentStatus,
  SocialPlatform,
  SocialPublicationStatus,
  StrategyApprovalStatus,
  WorkflowRunStatus,
} from '@prisma/client';

/** Owning project reference attached to admin campaign responses. */
export interface AdminCampaignProjectRef {
  id: string;
  name: string;
}

/** Project owner exposed on the campaign detail response. */
export interface AdminCampaignOwner {
  id: string;
  name: string;
  email: string;
}

/** One row of the admin campaign listing (no nested relations). */
export interface AdminCampaignListItem {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  startDate: Date | null;
  endDate: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: AdminCampaignProjectRef;
  contentCount: number;
  strategyCount: number;
  contentRunCount: number;
}

/** Aggregate counts over the relations hanging off a campaign. */
export interface AdminCampaignSummary {
  contents: number;
  strategies: number;
  contentRuns: number;
  publications: number;
  workflowExecutions: number;
}

/** Campaign detail including owner and relation summaries. */
export interface AdminCampaignDetail {
  id: string;
  name: string;
  description: string | null;
  objective: string | null;
  audience: string | null;
  tone: string | null;
  channels: string[];
  status: CampaignStatus;
  startDate: Date | null;
  endDate: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: {
    id: string;
    name: string;
    owner: AdminCampaignOwner;
  };
  summary: AdminCampaignSummary;
}

/** One row of the admin campaign generated-content listing. */
export interface AdminCampaignContentListItem {
  id: string;
  type: string;
  title: string | null;
  format: ContentFormat;
  status: GeneratedContentStatus;
  version: number;
  isEdited: boolean;
  error: string | null;
  contentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One row of the admin campaign social-publication listing. */
export interface AdminCampaignPublicationListItem {
  id: string;
  status: SocialPublicationStatus;
  platform: SocialPlatform;
  accountName: string;
  caption: string;
  scheduledFor: Date;
  publishedAt: Date | null;
  externalPostId: string | null;
  error: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One strategy workflow run under a campaign (Campaign → Workflow Run). */
export interface AdminCampaignStrategyListItem {
  id: string;
  runId: string | null;
  status: WorkflowRunStatus;
  approvalStatus: StrategyApprovalStatus;
  error: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
}

/** One content workflow run under a campaign (Campaign → Workflow Run). */
export interface AdminCampaignContentRunListItem {
  id: string;
  runId: string | null;
  status: WorkflowRunStatus;
  contentCount: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
}
