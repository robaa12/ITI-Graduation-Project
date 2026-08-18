import { HttpException } from '@nestjs/common';
import { GenerationCreditKind } from '@prisma/client';

import { ContentWorkflowService } from './content-workflow.service';

const FREE_PLAN = {
  code: 'free',
  name: 'Free',
  maxCampaignWeeks: 1,
  maxPostsPerWeek: 3,
  maxPlatforms: 1,
  allowsImageGeneration: false,
};

const PRO_PLAN = {
  code: 'pro',
  name: 'Pro',
  maxCampaignWeeks: 3,
  maxPostsPerWeek: 6,
  maxPlatforms: 3,
  allowsImageGeneration: true,
};

const BODY = {
  brandName: 'Shark & Sprout',
  product: 'Organic cotton baby tees',
  targetAudience: 'Eco-conscious parents',
  campaignStrategy: { summary: 'A launch campaign' },
  platforms: ['instagram', 'linkedin'],
  duration: '3 weeks',
  postsPerWeek: 6,
  generateImages: true,
};

describe('ContentWorkflowService.start', () => {
  let tx: any;
  let prisma: any;
  let queue: any;
  let credits: any;
  let service: ContentWorkflowService;

  beforeEach(() => {
    tx = {
      campaignContentRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-row-1' }),
      },
      workflowExecution: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
      campaignContentRun: { updateMany: jest.fn() },
      workflowExecution: { updateMany: jest.fn() },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    credits = {
      getUsage: jest.fn().mockResolvedValue(usage(PRO_PLAN, 40)),
      consumeInTransaction: jest.fn().mockResolvedValue(undefined),
      refund: jest.fn(),
    };

    service = new ContentWorkflowService(
      prisma,
      { findOwnedOrFail: jest.fn().mockResolvedValue(campaign()) } as never,
      { findOwnedOrFail: jest.fn() } as never,
      queue,
      {} as never,
      credits,
      { collectOrSchedule: jest.fn() } as never,
    );
  });

  it('charges one credit per post the run will produce', async () => {
    await service.start('user-1', 'campaign-1', { ...BODY });

    // 3 weeks x 6 posts x 2 platforms
    expect(credits.consumeInTransaction).toHaveBeenCalledWith(
      tx,
      'user-1',
      GenerationCreditKind.CONTENT_WORKFLOW,
      expect.stringContaining('content-workflow:'),
      36,
    );
  });

  it('pins maxPosts to what was charged, so the pipeline cannot generate more', async () => {
    await service.start('user-1', 'campaign-1', { ...BODY });

    const { input } = tx.campaignContentRun.create.mock.calls[0][0].data;
    expect(input.maxPosts).toBe(36);
  });

  it('refuses before a run row exists when the balance is short', async () => {
    credits.getUsage.mockResolvedValue(usage(PRO_PLAN, 10));

    await expect(
      service.start('user-1', 'campaign-1', { ...BODY }),
    ).rejects.toMatchObject({ status: 402 });

    expect(tx.campaignContentRun.create).not.toHaveBeenCalled();
    expect(credits.consumeInTransaction).not.toHaveBeenCalled();
  });

  it('names the shortfall so the caller knows what to change', async () => {
    credits.getUsage.mockResolvedValue(usage(PRO_PLAN, 10));

    try {
      await service.start('user-1', 'campaign-1', { ...BODY });
      throw new Error('expected a 402');
    } catch (error) {
      const response = (error as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response).toMatchObject({
        code: 'GENERATION_CREDITS_EXHAUSTED',
        required: 36,
      });
    }
  });

  it('withholds images on a plan that does not include them', async () => {
    credits.getUsage.mockResolvedValue(usage(FREE_PLAN, 4));

    await service.start('user-1', 'campaign-1', {
      ...BODY,
      platforms: ['instagram'],
      duration: '1 week',
      postsPerWeek: 3,
      generateImages: true,
    });

    const { input } = tx.campaignContentRun.create.mock.calls[0][0].data;
    expect(input.generateImages).toBe(false);
    expect(credits.consumeInTransaction).toHaveBeenCalledWith(
      tx,
      'user-1',
      GenerationCreditKind.CONTENT_WORKFLOW,
      expect.any(String),
      3,
    );
  });

  it('rejects a campaign shape the plan does not allow', async () => {
    credits.getUsage.mockResolvedValue(usage(FREE_PLAN, 4));

    await expect(
      service.start('user-1', 'campaign-1', {
        ...BODY,
        duration: '1 week',
        postsPerWeek: 3,
        platforms: ['instagram', 'linkedin'],
      }),
    ).rejects.toThrow('1 platform per campaign');
  });

  it('refuses a run larger than the pipeline can produce', async () => {
    credits.getUsage.mockResolvedValue({
      ...usage(PRO_PLAN, 400),
      plan: { ...PRO_PLAN, maxCampaignWeeks: null, maxPlatforms: null },
    });

    await expect(
      service.start('user-1', 'campaign-1', {
        ...BODY,
        duration: '6 weeks',
        postsPerWeek: 6,
        platforms: ['instagram', 'linkedin', 'x'],
      }),
    ).rejects.toThrow('at most 60 posts');
  });

  function usage(plan: object, remaining: number) {
    return {
      plan,
      limit: remaining,
      used: 0,
      remaining,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      canGenerate: true,
      blockedReason: null,
    };
  }

  function campaign() {
    return {
      id: 'campaign-1',
      name: 'Launch',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      timezone: 'UTC',
    };
  }
});
