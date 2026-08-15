import {
  SocialConnectionStatus,
  SocialPlatform,
  SocialPublicationStatus,
} from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { MetaClient } from './meta.client';
import type { SocialPublicationJob } from './social-publication.queue';
import { SocialPublicationProcessor } from './social-publication.processor';
import { TokenCipherService } from './token-cipher.service';

describe('SocialPublicationProcessor', () => {
  it('claims a queued row and stores the provider post id', async () => {
    type PublicationWrite = {
      data: {
        status: SocialPublicationStatus;
        externalPostId?: string;
      };
    };
    const writes: PublicationWrite[] = [];
    const updatePublication = jest.fn((input: PublicationWrite) => {
      writes.push(input);
      return Promise.resolve({ count: 1 });
    });
    const findPublication = jest.fn().mockResolvedValue({
      id: 'publication-1',
      revision: 2,
      status: SocialPublicationStatus.QUEUED,
      caption: 'Launch day',
      mediaUrl: null,
      socialAccount: {
        id: 'account-1',
        platform: SocialPlatform.FACEBOOK,
        externalId: 'page-1',
        accessTokenCiphertext: 'encrypted-token',
        selected: true,
        available: true,
        connectionId: 'connection-1',
        connection: { status: SocialConnectionStatus.ACTIVE },
      },
    });
    const publishFacebook = jest.fn().mockResolvedValue('post-123');
    const prisma = {
      socialPublication: {
        findUnique: findPublication,
        updateMany: updatePublication,
      },
    } as unknown as PrismaService;
    const processor = new SocialPublicationProcessor(
      prisma,
      { publishFacebook } as unknown as MetaClient,
      { decrypt: () => 'page-token' } as unknown as TokenCipherService,
    );

    await processor.process({
      data: { publicationId: 'publication-1', revision: 2 },
    } as Job<SocialPublicationJob>);

    expect(publishFacebook).toHaveBeenCalledWith({
      pageId: 'page-1',
      accessToken: 'page-token',
      caption: 'Launch day',
      mediaUrl: null,
    });
    expect(writes.at(-1)?.data.status).toBe(SocialPublicationStatus.PUBLISHED);
    expect(writes.at(-1)?.data.externalPostId).toBe('post-123');
  });
});
