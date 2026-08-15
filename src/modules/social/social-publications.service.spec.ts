import {
  GeneratedContentStatus,
  SocialConnectionStatus,
  SocialPlatform,
  WorkflowRunStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import type { SocialPublicationJob } from './social-publication.queue';
import { SocialPublicationsService } from './social-publications.service';

describe('SocialPublicationsService', () => {
  const content = {
    id: 'content-1',
    status: GeneratedContentStatus.READY,
    body: 'Launch day is here.',
    payload: {
      hashtags: ['#launch'],
      cta: 'Learn more',
      imageUrl: 'https://cdn.example.com/launch.jpg',
    },
    contentRun: {
      strategyId: 'strategy-1',
      status: WorkflowRunStatus.READY,
    },
  };
  const account = {
    id: 'account-1',
    platform: SocialPlatform.INSTAGRAM,
    externalId: 'ig-1',
    name: 'Acme',
    selected: true,
    available: true,
    connection: { status: SocialConnectionStatus.ACTIVE },
  };

  it('freezes approved workflow content and enqueues a revisioned job', async () => {
    type PublicationData = {
      contentId: string;
      socialAccountId: string;
      caption: string;
      mediaUrl: string | null;
      platform: SocialPlatform;
      accountName: string;
      externalAccountId: string;
      scheduledFor: Date;
      status: 'QUEUED' | 'SCHEDULED';
    };
    let persisted: PublicationData | null = null;
    const create = jest.fn(({ data }: { data: PublicationData }) => {
      persisted = data;
      return Promise.resolve({
        id: 'publication-1',
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
        externalPostId: null,
        error: null,
        ...data,
      });
    });
    const prisma = {
      generatedContent: { findFirst: jest.fn().mockResolvedValue(content) },
      socialAccount: { findFirst: jest.fn().mockResolvedValue(account) },
      socialPublication: { create },
    } as unknown as PrismaService;
    const add = jest.fn().mockResolvedValue({});
    const queue = { add } as unknown as Queue<SocialPublicationJob>;
    const service = new SocialPublicationsService(prisma, queue);

    const result = await service.create('user-1', 'content-1', {
      socialAccountId: 'account-1',
    });

    expect(result.caption).toBe('Launch day is here.\n\n#launch\n\nLearn more');
    expect(result.mediaUrl).toBe('https://cdn.example.com/launch.jpg');
    expect(persisted).toMatchObject({
      platform: SocialPlatform.INSTAGRAM,
      externalAccountId: 'ig-1',
    });
    expect(add).toHaveBeenCalledWith(
      'publish',
      { publicationId: 'publication-1', revision: 1 },
      expect.objectContaining({ jobId: 'publication-1-r1', attempts: 1 }),
    );
  });

  it('does not publish content from the legacy per-item path', async () => {
    const prisma = {
      generatedContent: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ ...content, contentRun: null }),
      },
      socialAccount: { findFirst: jest.fn().mockResolvedValue(account) },
    } as unknown as PrismaService;
    const service = new SocialPublicationsService(prisma, {
      add: jest.fn(),
    } as unknown as Queue<SocialPublicationJob>);

    await expect(
      service.create('user-1', 'content-1', {
        socialAccountId: 'account-1',
      }),
    ).rejects.toThrow('approved-strategy workflow');
  });

  it('requires public media before scheduling Instagram', async () => {
    const prisma = {
      generatedContent: {
        findFirst: jest.fn().mockResolvedValue({
          ...content,
          payload: { imageUrl: 'data:image/png;base64,abc' },
        }),
      },
      socialAccount: { findFirst: jest.fn().mockResolvedValue(account) },
    } as unknown as PrismaService;
    const service = new SocialPublicationsService(prisma, {
      add: jest.fn(),
    } as unknown as Queue<SocialPublicationJob>);

    await expect(
      service.create('user-1', 'content-1', {
        socialAccountId: 'account-1',
      }),
    ).rejects.toThrow('public HTTPS image URL');
  });
});
