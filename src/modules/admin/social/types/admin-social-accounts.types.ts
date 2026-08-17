import type {
  SocialConnectionProvider,
  SocialConnectionStatus,
  SocialPlatform,
} from '@prisma/client';

/** Owning user reference on connector responses. */
export interface AdminSocialConnectorUserRef {
  id: string;
  name: string;
  email: string;
}

/** One row of the admin social-connection listing. Never includes tokens. */
export interface AdminSocialConnectionListItem {
  id: string;
  provider: SocialConnectionProvider;
  status: SocialConnectionStatus;
  externalUserId: string | null;
  accessTokenExpiresAt: Date | null;
  grantedScopes: string[];
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: AdminSocialConnectorUserRef;
  accountCount: number;
}

/** Full connection view with an accounts-by-platform summary. */
export interface AdminSocialConnectionDetail extends AdminSocialConnectionListItem {
  accountsByPlatform: Array<{ platform: SocialPlatform; count: number }>;
}

/** One row of the admin social-account listing. Never includes tokens. */
export interface AdminSocialAccountListItem {
  id: string;
  platform: SocialPlatform;
  externalId: string;
  name: string;
  username: string | null;
  imageUrl: string | null;
  tasks: string[];
  selected: boolean;
  available: boolean;
  createdAt: Date;
  updatedAt: Date;
  connection: {
    id: string;
    provider: SocialConnectionProvider;
    status: SocialConnectionStatus;
  } | null;
  publicationCount: number;
}

/** Full account view with its connection status and metadata. */
export interface AdminSocialAccountDetail extends AdminSocialAccountListItem {
  connection: {
    id: string;
    provider: SocialConnectionProvider;
    status: SocialConnectionStatus;
    externalUserId: string | null;
    lastSyncedAt: Date | null;
    lastError: string | null;
  } | null;
}
