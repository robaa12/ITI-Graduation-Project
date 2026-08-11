import { createHmac } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
] as const;

interface MetaTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

export interface DiscoveredMetaAccount {
  platform: 'FACEBOOK' | 'INSTAGRAM';
  externalId: string;
  name: string;
  username?: string;
  imageUrl?: string;
  tasks: string[];
  accessToken: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly type?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

@Injectable()
export class MetaClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('meta.appId') &&
      this.config.get<string>('meta.appSecret') &&
      this.config.get<string>('meta.redirectUri'),
    );
  }

  getFrontendRedirectUrl(): string {
    return this.config.getOrThrow<string>('meta.frontendRedirectUrl');
  }

  buildAuthorizationUrl(state: string): string {
    const { appId, redirectUri, version } = this.settings();
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: META_SCOPES.join(','),
    });
    const loginConfigId = this.config.get<string>('meta.loginConfigId');
    if (loginConfigId) params.set('config_id', loginConfigId);
    url.search = params.toString();
    return url.toString();
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    expiresAt: Date | null;
  }> {
    const { appId, appSecret, redirectUri } = this.settings();
    const shortLived = await this.graphGet<MetaTokenResponse>(
      '/oauth/access_token',
      undefined,
      {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      },
      false,
    );
    if (!shortLived.access_token) {
      throw new MetaApiError('Meta token exchange returned no access token');
    }
    const longLived = await this.graphGet<MetaTokenResponse>(
      '/oauth/access_token',
      undefined,
      {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.access_token,
      },
      false,
    );
    if (!longLived.access_token) {
      throw new MetaApiError(
        'Meta long-lived token exchange returned no access token',
      );
    }

    return {
      accessToken: longLived.access_token,
      expiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1_000)
        : null,
    };
  }

  async discoverAccounts(accessToken: string): Promise<{
    externalUserId: string;
    grantedScopes: string[];
    accounts: DiscoveredMetaAccount[];
  }> {
    const [profile, permissions, pages] = await Promise.all([
      this.graphGet<{ id: string }>('/me', accessToken, { fields: 'id' }),
      this.graphGet<{
        data?: Array<{ permission?: string; status?: string }>;
      }>('/me/permissions', accessToken),
      this.graphGet<{ data?: MetaPage[] }>('/me/accounts', accessToken, {
        limit: '100',
        fields:
          'id,name,access_token,tasks,picture,instagram_business_account{id,username,name,profile_picture_url}',
      }),
    ]);

    const accounts: DiscoveredMetaAccount[] = [];
    for (const page of pages.data ?? []) {
      if (!page.id || !page.name || !page.access_token) continue;
      accounts.push({
        platform: 'FACEBOOK',
        externalId: page.id,
        name: page.name,
        imageUrl: page.picture?.data?.url,
        tasks: page.tasks ?? [],
        accessToken: page.access_token,
      });
      const instagram = page.instagram_business_account;
      if (instagram?.id) {
        accounts.push({
          platform: 'INSTAGRAM',
          externalId: instagram.id,
          name: instagram.name || instagram.username || page.name,
          username: instagram.username,
          imageUrl: instagram.profile_picture_url,
          tasks: page.tasks ?? [],
          accessToken: page.access_token,
        });
      }
    }

    return {
      externalUserId: profile.id,
      grantedScopes: (permissions.data ?? [])
        .filter((permission) => permission.status === 'granted')
        .map((permission) => permission.permission)
        .filter((permission): permission is string => Boolean(permission)),
      accounts,
    };
  }

  async publishFacebook(input: {
    pageId: string;
    accessToken: string;
    caption: string;
    mediaUrl?: string | null;
  }): Promise<string> {
    const result = input.mediaUrl
      ? await this.graphPost<{ id: string }>(
          `/${input.pageId}/photos`,
          input.accessToken,
          { url: input.mediaUrl, caption: input.caption, published: 'true' },
        )
      : await this.graphPost<{ id: string }>(
          `/${input.pageId}/feed`,
          input.accessToken,
          { message: input.caption },
        );
    return result.id;
  }

  async publishInstagram(input: {
    accountId: string;
    accessToken: string;
    caption: string;
    mediaUrl: string;
  }): Promise<string> {
    const container = await this.graphPost<{ id: string }>(
      `/${input.accountId}/media`,
      input.accessToken,
      { image_url: input.mediaUrl, caption: input.caption },
    );
    const result = await this.graphPost<{ id: string }>(
      `/${input.accountId}/media_publish`,
      input.accessToken,
      { creation_id: container.id },
    );
    return result.id;
  }

  async revokeAuthorization(accessToken: string): Promise<void> {
    await this.request<{ success?: boolean }>(
      'DELETE',
      '/me/permissions',
      accessToken,
      {},
      true,
    );
  }

  private async graphGet<T>(
    path: string,
    accessToken?: string,
    params: Record<string, string> = {},
    versioned = true,
  ): Promise<T> {
    return this.request<T>('GET', path, accessToken, params, versioned);
  }

  private async graphPost<T>(
    path: string,
    accessToken: string,
    params: Record<string, string>,
  ): Promise<T> {
    return this.request<T>('POST', path, accessToken, params, true);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    accessToken: string | undefined,
    params: Record<string, string>,
    versioned: boolean,
  ): Promise<T> {
    const { appSecret, version } = this.settings();
    const prefix = versioned ? `/${version}` : '';
    const url = new URL(`https://graph.facebook.com${prefix}${path}`);
    const values = new URLSearchParams(params);
    if (accessToken) {
      values.set('access_token', accessToken);
      values.set(
        'appsecret_proof',
        createHmac('sha256', appSecret).update(accessToken).digest('hex'),
      );
    }
    const body = method === 'POST' ? values : undefined;
    if (method !== 'POST') url.search = values.toString();

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: body
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : undefined,
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new MetaApiError(
        `Could not reach Meta: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; type?: string };
    } & T;
    if (!response.ok || payload.error) {
      throw new MetaApiError(
        payload.error?.message || `Meta returned HTTP ${response.status}`,
        payload.error?.code,
        payload.error?.type,
      );
    }
    return payload;
  }

  private settings(): {
    appId: string;
    appSecret: string;
    redirectUri: string;
    version: string;
  } {
    const appId = this.config.get<string>('meta.appId');
    const appSecret = this.config.get<string>('meta.appSecret');
    const redirectUri = this.config.get<string>('meta.redirectUri');
    if (!appId || !appSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'Meta connectors are not configured',
      );
    }
    return {
      appId,
      appSecret,
      redirectUri,
      version: this.config.get<string>('meta.graphVersion') ?? 'v25.0',
    };
  }
}
