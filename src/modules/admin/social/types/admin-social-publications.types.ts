import type {
  ContentFormat,
  GeneratedContentStatus,
  SocialConnectionProvider,
  SocialConnectionStatus,
  SocialPlatform,
  SocialPublicationStatus,
} from '@prisma/client';

/** Owning project reference on publication responses. */
export interface AdminSocialProjectRef {
  id: string;
  name: string;
}

/** Owning campaign reference on publication responses. */
export interface AdminSocialCampaignRef {
  id: string;
  name: string;
}

/** Generated-content reference that a publication was created from. */
export interface AdminSocialContentRef {
  id: string;
  title: string | null;
}

/** Safe connection metadata (never token material). */
export interface AdminSocialConnectionRef {
  id: string;
  provider: SocialConnectionProvider;
  status: SocialConnectionStatus;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

/** Safe social account reference — credentials are never returned. */
export interface AdminSocialAccountRef {
  id: string;
  platform: SocialPlatform;
  name: string;
  username: string | null;
  imageUrl: string | null;
  externalId: string;
  selected: boolean;
  available: boolean;
  connection: AdminSocialConnectionRef | null;
}

/** One row of the admin social publication listing. */
export interface AdminSocialPublicationListItem {
  id: string;
  status: SocialPublicationStatus;
  scheduledFor: Date;
  caption: string;
  platform: SocialPlatform;
  accountName: string;
  externalAccountId: string;
  publishedAt: Date | null;
  externalPostId: string | null;
  error: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  content: AdminSocialContentRef | null;
  campaign: AdminSocialCampaignRef | null;
  project: AdminSocialProjectRef | null;
  socialAccount: AdminSocialAccountRef | null;
}

/** Richer generated-content reference on the publication detail. */
export interface AdminSocialContentDetailRef {
  id: string;
  title: string | null;
  type: string;
  format: ContentFormat;
  status: GeneratedContentStatus;
}

/** Full social publication view for the admin dashboard. */
export interface AdminSocialPublicationDetail {
  id: string;
  status: SocialPublicationStatus;
  scheduledFor: Date;
  caption: string;
  mediaUrl: string | null;
  platform: SocialPlatform;
  accountName: string;
  externalAccountId: string;
  publishedAt: Date | null;
  externalPostId: string | null;
  error: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  content: AdminSocialContentDetailRef | null;
  campaign: AdminSocialCampaignRef | null;
  project: {
    id: string;
    name: string;
    owner: { id: string; name: string; email: string };
  } | null;
  socialAccount: AdminSocialAccountRef | null;
}
