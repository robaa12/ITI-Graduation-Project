import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  SocialConnectionProvider,
  SocialConnectionStatus,
  SocialPlatform,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DiscoveredMetaAccount, MetaApiError, MetaClient } from './meta.client';
import { TokenCipherService } from './token-cipher.service';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class MetaConnectorsService {
  private readonly logger = new Logger(MetaConnectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaClient,
    private readonly cipher: TokenCipherService,
  ) {}

  async status(userId: string) {
    const configured = this.meta.isConfigured() && this.cipher.isConfigured();
    const connection = await this.prisma.socialConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: SocialConnectionProvider.META,
        },
      },
      include: {
        accounts: {
          orderBy: [{ platform: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            platform: true,
            externalId: true,
            name: true,
            username: true,
            imageUrl: true,
            tasks: true,
            selected: true,
            available: true,
            updatedAt: true,
          },
        },
      },
    });

    return {
      configured,
      connection: connection
        ? {
            id: connection.id,
            provider: connection.provider,
            status: connection.status,
            accessTokenExpiresAt: connection.accessTokenExpiresAt,
            grantedScopes: connection.grantedScopes,
            lastSyncedAt: connection.lastSyncedAt,
            lastError: connection.lastError,
            accounts: connection.accounts.map((account) => ({
              id: account.id,
              platform: account.platform,
              externalId: account.externalId,
              name: account.name,
              username: account.username,
              imageUrl: account.imageUrl,
              tasks: account.tasks,
              selected: account.selected,
              available: account.available,
              updatedAt: account.updatedAt,
            })),
          }
        : null,
    };
  }

  async startOAuth(userId: string): Promise<{ authorizationUrl: string }> {
    this.assertConfigured();
    const state = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.metaOAuthState.deleteMany({
        where: {
          OR: [{ expiresAt: { lte: new Date() } }, { userId }],
        },
      }),
      this.prisma.metaOAuthState.create({
        data: {
          userId,
          stateHash: hashState(state),
          expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        },
      }),
    ]);
    return { authorizationUrl: this.meta.buildAuthorizationUrl(state) };
  }

  async completeOAuth(input: {
    state?: string;
    code?: string;
    error?: string;
  }): Promise<void> {
    this.assertConfigured();
    if (!input.state) throw new BadRequestException('OAuth state is missing');
    const state = await this.consumeState(input.state);
    if (input.error) {
      throw new BadRequestException('Meta authorization was cancelled');
    }
    if (!input.code) {
      throw new BadRequestException('OAuth authorization code is missing');
    }

    const token = await this.meta.exchangeCode(input.code);
    const discovery = await this.meta.discoverAccounts(token.accessToken);
    await this.persistDiscovery({
      userId: state.userId,
      externalUserId: discovery.externalUserId,
      grantedScopes: discovery.grantedScopes,
      userAccessToken: token.accessToken,
      expiresAt: token.expiresAt,
      accounts: discovery.accounts,
    });
  }

  async sync(userId: string) {
    this.assertConfigured();
    const connection = await this.findConnection(userId);
    if (
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt <= new Date()
    ) {
      await this.prisma.socialConnection.update({
        where: { id: connection.id },
        data: { status: SocialConnectionStatus.EXPIRED },
      });
      throw new ConflictException('Meta authorization has expired; reconnect');
    }

    try {
      const userAccessToken = this.cipher.decrypt(
        connection.accessTokenCiphertext,
      );
      const discovery = await this.meta.discoverAccounts(userAccessToken);
      await this.persistDiscovery({
        userId,
        externalUserId: discovery.externalUserId,
        grantedScopes: discovery.grantedScopes,
        userAccessToken,
        expiresAt: connection.accessTokenExpiresAt,
        accounts: discovery.accounts,
      });
    } catch (error) {
      const expired = error instanceof MetaApiError && error.code === 190;
      await this.prisma.socialConnection.updateMany({
        where: { id: connection.id },
        data: {
          status: expired
            ? SocialConnectionStatus.EXPIRED
            : SocialConnectionStatus.ERROR,
          lastError: safeErrorMessage(error),
        },
      });
      throw error;
    }
    return this.status(userId);
  }

  async updateAccountSelection(
    userId: string,
    accountId: string,
    selected: boolean,
  ) {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, connection: { userId } },
    });
    if (!account)
      throw new NotFoundException(`Social account ${accountId} not found`);
    if (selected && !account.available) {
      throw new ConflictException(
        'This account is no longer available from Meta',
      );
    }
    return this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { selected },
      select: {
        id: true,
        platform: true,
        externalId: true,
        name: true,
        username: true,
        imageUrl: true,
        tasks: true,
        selected: true,
        available: true,
        updatedAt: true,
      },
    });
  }

  async disconnect(userId: string): Promise<void> {
    const connection = await this.findConnection(userId);
    try {
      await this.meta.revokeAuthorization(
        this.cipher.decrypt(connection.accessTokenCiphertext),
      );
    } catch (error) {
      this.logger.warn(
        `Meta revocation failed for connection ${connection.id}: ${safeErrorMessage(error)}`,
      );
    }
    await this.prisma.socialConnection.delete({ where: { id: connection.id } });
  }

  getFrontendRedirectUrl(result: 'connected' | 'error'): string {
    const url = new URL(this.meta.getFrontendRedirectUrl());
    url.searchParams.set('meta', result);
    return url.toString();
  }

  private assertConfigured(): void {
    if (!this.meta.isConfigured() || !this.cipher.isConfigured()) {
      // Trigger the cipher's specific configuration error where applicable.
      if (this.meta.isConfigured()) this.cipher.encrypt('configuration-check');
      this.meta.buildAuthorizationUrl('configuration-check');
    }
  }

  private async consumeState(rawState: string) {
    const stateHash = hashState(rawState);
    const state = await this.prisma.metaOAuthState.findUnique({
      where: { stateHash },
    });
    if (!state || state.expiresAt <= new Date()) {
      if (state) {
        await this.prisma.metaOAuthState.deleteMany({
          where: { id: state.id },
        });
      }
      throw new BadRequestException('OAuth state is invalid or expired');
    }
    try {
      await this.prisma.metaOAuthState.delete({ where: { stateHash } });
    } catch {
      throw new BadRequestException('OAuth state has already been used');
    }
    return state;
  }

  private findConnection(userId: string) {
    return this.prisma.socialConnection
      .findUnique({
        where: {
          userId_provider: {
            userId,
            provider: SocialConnectionProvider.META,
          },
        },
      })
      .then((connection) => {
        if (!connection) throw new NotFoundException('Meta is not connected');
        return connection;
      });
  }

  private async persistDiscovery(input: {
    userId: string;
    externalUserId: string;
    grantedScopes: string[];
    userAccessToken: string;
    expiresAt: Date | null;
    accounts: DiscoveredMetaAccount[];
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const connection = await tx.socialConnection.upsert({
        where: {
          userId_provider: {
            userId: input.userId,
            provider: SocialConnectionProvider.META,
          },
        },
        create: {
          userId: input.userId,
          provider: SocialConnectionProvider.META,
          externalUserId: input.externalUserId,
          accessTokenCiphertext: this.cipher.encrypt(input.userAccessToken),
          accessTokenExpiresAt: input.expiresAt,
          grantedScopes: input.grantedScopes,
          lastSyncedAt: new Date(),
        },
        update: {
          status: SocialConnectionStatus.ACTIVE,
          externalUserId: input.externalUserId,
          accessTokenCiphertext: this.cipher.encrypt(input.userAccessToken),
          accessTokenExpiresAt: input.expiresAt,
          grantedScopes: input.grantedScopes,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      await tx.socialAccount.updateMany({
        where: { connectionId: connection.id },
        data: { available: false },
      });
      for (const account of input.accounts) {
        await tx.socialAccount.upsert({
          where: {
            connectionId_platform_externalId: {
              connectionId: connection.id,
              platform: SocialPlatform[account.platform],
              externalId: account.externalId,
            },
          },
          create: {
            connectionId: connection.id,
            platform: SocialPlatform[account.platform],
            externalId: account.externalId,
            name: account.name,
            username: account.username,
            imageUrl: account.imageUrl,
            tasks: account.tasks,
            accessTokenCiphertext: this.cipher.encrypt(account.accessToken),
          },
          update: {
            name: account.name,
            username: account.username,
            imageUrl: account.imageUrl,
            tasks: account.tasks,
            accessTokenCiphertext: this.cipher.encrypt(account.accessToken),
            available: true,
          },
        });
      }
    });
  }
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1_000);
}
