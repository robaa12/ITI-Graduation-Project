import type {
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from '@prisma/client';

import type { sourceFreshness } from '../../../knowledge/knowledge.service';

/** Minimal project reference attached to knowledge responses. */
export interface AdminKnowledgeProjectRef {
  id: string;
  name: string;
}

/** Project owner exposed on the knowledge source detail response. */
export interface AdminKnowledgeOwner {
  id: string;
  name: string;
  email: string;
}

/** Source freshness derived by the shared knowledge freshness logic. */
export type AdminKnowledgeFreshness = ReturnType<typeof sourceFreshness>;

/** One row of the admin knowledge source listing (no raw content). */
export interface AdminKnowledgeSourceListItem {
  id: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  name: string;
  url: string | null;
  error: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: AdminKnowledgeProjectRef;
  pageCount: number;
  freshness: AdminKnowledgeFreshness;
}

/** Knowledge source detail including project owner and crawl metadata. */
export interface AdminKnowledgeSourceDetail {
  id: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  name: string;
  url: string | null;
  metadata: unknown;
  error: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: {
    id: string;
    name: string;
    owner: AdminKnowledgeOwner;
  };
  pageCount: number;
  freshness: AdminKnowledgeFreshness;
}

/** One row of the admin knowledge page listing. */
export interface AdminKnowledgePageListItem {
  id: string;
  url: string;
  title: string;
  error: string | null;
  crawledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source: {
    id: string;
    name: string;
    type: KnowledgeSourceType;
    status: KnowledgeSourceStatus;
  };
}

/** Knowledge page detail including its source and owning project. */
export interface AdminKnowledgePageDetail {
  id: string;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  error: string | null;
  crawledAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source: {
    id: string;
    name: string;
    type: KnowledgeSourceType;
    status: KnowledgeSourceStatus;
    url: string | null;
  };
  project: AdminKnowledgeProjectRef;
}
