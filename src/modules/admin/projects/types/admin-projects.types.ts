import type { ProjectStatus } from '@prisma/client';

/** Project owner information exposed to the admin UI. */
export interface AdminProjectOwner {
  id: string;
  name: string;
  email: string;
}

/** One row of the admin project listing (no nested relations). */
export interface AdminProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  owner: AdminProjectOwner;
  campaignCount: number;
  knowledgeSourceCount: number;
}

/** Aggregate counts over the relations hanging off a project. */
export interface AdminProjectSummary {
  campaigns: number;
  knowledgeSources: number;
  strategies: number;
  contents: number;
  workflowExecutions: number;
}

/** Project detail including the owner and relation summaries. */
export interface AdminProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  archivedAt: Date | null;
  brandProfile: unknown;
  createdAt: Date;
  updatedAt: Date;
  owner: AdminProjectOwner;
  summary: AdminProjectSummary;
}
