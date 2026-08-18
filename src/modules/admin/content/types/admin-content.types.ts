import type { ContentFormat, GeneratedContentStatus } from '@prisma/client';

/** Owning campaign reference on content responses. */
export interface AdminContentCampaignRef {
  id: string;
  name: string;
}

/** Owning project reference on content responses. */
export interface AdminContentProjectRef {
  id: string;
  name: string;
}

/** Owning user reference on content responses. */
export interface AdminContentUserRef {
  id: string;
  name: string;
  email: string;
}

/** One row of the admin generated-content listing. */
export interface AdminContentListItem {
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
  campaign: AdminContentCampaignRef | null;
  project: AdminContentProjectRef | null;
  user: AdminContentUserRef | null;
}

/** Full generated-content view including body and generation metadata. */
export interface AdminContentDetail extends AdminContentListItem {
  body: string | null;
  payload: unknown;
  prompt: string | null;
  model: string | null;
}
