import type {
  CampaignStatus,
  GeneratedContentStatus,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  ProjectStatus,
  SocialPlatform,
  SocialPublicationStatus,
  StrategyApprovalStatus,
  SubscriptionStatus,
  UserRole,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';

/** The effective date window applied to windowed metrics (new/recent). */
export interface DashboardRange {
  from: string;
  to: string;
}

export interface UserStats {
  /** All-time registered users. */
  total: number;
  /** Users created inside the requested window. */
  new: number;
  /** All-time users with a verified email. */
  verified: number;
  /** All-time users without a verified email. */
  unverified: number;
  byRole: Array<{ role: UserRole; count: number }>;
}

export interface ProjectStats {
  /** All-time projects. */
  total: number;
  /** Projects created inside the requested window. */
  recent: number;
  byStatus: Array<{ status: ProjectStatus; count: number }>;
}

export interface SubscriptionStats {
  total: number;
  active: number;
  canceled: number;
  paused: number;
  byStatus: Array<{ status: SubscriptionStatus; count: number }>;
  /** Distribution by plan; `planCode` is null when no plan is attached. */
  byPlan: Array<{ planCode: string | null; count: number }>;
  /**
   * Money actually moved through the application: the sum of consumed
   * plan-change quotes. Initial subscription charges are settled by Stripe and
   * are not recorded as monetary rows in this schema, so they are not included.
   */
  planChangeRevenueCents: number;
  chargedPlanChanges: number;
}

export interface WorkflowStats {
  /** All-time Mastra workflow executions (strategy, revision, content). */
  total: number;
  /** Executions that finished successfully (status READY). */
  successful: number;
  /** Executions that failed (status FAILED). */
  failed: number;
  /** Executions still pending, running, or suspended. */
  pending: number;
  byStatus: Array<{ status: WorkflowRunStatus; count: number }>;
  byKind: Array<{ kind: WorkflowExecutionKind; count: number }>;
}

export interface ContentStats {
  total: number;
  byStatus: Array<{ status: GeneratedContentStatus; count: number }>;
}

export interface KnowledgeStats {
  total: number;
  /** Crawled pages under website knowledge sources. */
  pages: number;
  byType: Array<{ type: KnowledgeSourceType; count: number }>;
  byStatus: Array<{ status: KnowledgeSourceStatus; count: number }>;
}

export interface SocialStats {
  publications: number;
  publicationsByStatus: Array<{
    status: SocialPublicationStatus;
    count: number;
  }>;
  /** Provider-level connections (e.g. one per user for Meta). */
  connections: number;
  /** Connected pages/professional accounts. */
  accounts: number;
  accountsByPlatform: Array<{ platform: SocialPlatform; count: number }>;
}

export interface StrategyStats {
  total: number;
  byStatus: Array<{ status: WorkflowRunStatus; count: number }>;
  byApprovalStatus: Array<{
    approvalStatus: StrategyApprovalStatus;
    count: number;
  }>;
}

export interface CampaignStats {
  total: number;
  byStatus: Array<{ status: CampaignStatus; count: number }>;
}

export interface DashboardOverview {
  /** Effective window used for windowed metrics; all-time totals ignore it. */
  range: DashboardRange;
  users: UserStats;
  projects: ProjectStats;
  subscriptions: SubscriptionStats;
  workflows: WorkflowStats;
  content: ContentStats;
  knowledge: KnowledgeStats;
  social: SocialStats;
  strategies: StrategyStats;
  campaigns: CampaignStats;
}
