import { createHash } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { MetaClient } from './meta.client';
import { MetaConnectorsService } from './meta-connectors.service';
import { TokenCipherService } from './token-cipher.service';

describe('MetaConnectorsService', () => {
  it('stores only a hash of the one-time OAuth state', async () => {
    type OAuthStateData = {
      stateHash: string;
      userId: string;
      expiresAt: Date;
    };
    let created: OAuthStateData | null = null;
    const prisma = {
      metaOAuthState: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(({ data }: { data: OAuthStateData }) => {
          created = data;
          return Promise.resolve(data);
        }),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    } as unknown as PrismaService;
    const meta = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest.fn(
        (state: string) => `https://facebook.example/oauth?state=${state}`,
      ),
    } as unknown as MetaClient;
    const cipher = {
      isConfigured: jest.fn().mockReturnValue(true),
    } as unknown as TokenCipherService;

    const result = await new MetaConnectorsService(
      prisma,
      meta,
      cipher,
    ).startOAuth('user-1');
    const rawState = new URL(result.authorizationUrl).searchParams.get('state');

    expect(rawState).toBeTruthy();
    expect(created).not.toBeNull();
    expect(created!.stateHash).toBe(
      createHash('sha256').update(rawState!).digest('hex'),
    );
    expect(created!.stateHash).not.toBe(rawState);
  });

  it('never exposes encrypted tokens in connector status', async () => {
    const prisma = {
      socialConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'connection-1',
          provider: 'META',
          status: 'ACTIVE',
          accessTokenCiphertext: 'secret-user-token',
          accessTokenExpiresAt: null,
          grantedScopes: ['pages_show_list'],
          lastSyncedAt: new Date(),
          lastError: null,
          accounts: [
            {
              id: 'account-1',
              platform: 'FACEBOOK',
              accessTokenCiphertext: 'secret-page-token',
              name: 'Page',
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new MetaConnectorsService(
      prisma,
      { isConfigured: () => true } as unknown as MetaClient,
      { isConfigured: () => true } as unknown as TokenCipherService,
    );

    const result = await service.status('user-1');

    expect(JSON.stringify(result)).not.toContain('secret-user-token');
    expect(JSON.stringify(result)).not.toContain('secret-page-token');
  });
});
