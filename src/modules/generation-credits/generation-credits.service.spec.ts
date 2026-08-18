import { HttpException } from '@nestjs/common';
import { GenerationCreditKind, SubscriptionStatus } from '@prisma/client';

import { GenerationCreditsService } from './generation-credits.service';

describe('GenerationCreditsService', () => {
  const periodStart = new Date('2026-08-01T00:00:00.000Z');
  const periodEnd = new Date('2099-09-01T00:00:00.000Z');
  let tx: any;
  let service: GenerationCreditsService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      plan: {
        findFirst: jest.fn().mockResolvedValue({
          code: 'free',
          name: 'Free',
          active: true,
          generationCredits: 4,
          maxCampaignWeeks: 1,
          maxPostsPerWeek: 3,
          maxPlatforms: 1,
          allowsImageGeneration: false,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(freeUser(0)),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      generationCreditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((callback) => callback(tx)),
    };
    service = new GenerationCreditsService(prisma as never);
  });

  it('spends one credit and returns the remaining balance', async () => {
    const usage = await service.consumeInTransaction(
      tx,
      'user-1',
      GenerationCreditKind.STRATEGY,
      'strategy:run-1',
    );

    expect(usage).toMatchObject({
      plan: { code: 'free', name: 'Free' },
      limit: 4,
      used: 1,
      remaining: 3,
      canGenerate: true,
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', generationCreditsUsed: { lte: 3 } },
      data: { generationCreditsUsed: { increment: 1 } },
    });
    expect(tx.generationCreditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        referenceId: 'strategy:run-1',
        kind: GenerationCreditKind.STRATEGY,
        amount: 1,
        periodStart,
      },
    });
  });

  it('returns an idempotent retry without charging it twice', async () => {
    tx.generationCreditEvent.findUnique.mockResolvedValue({ id: 'event-1' });

    const usage = await service.consumeInTransaction(
      tx,
      'user-1',
      GenerationCreditKind.CONTENT_WORKFLOW,
      'content-workflow:run-1',
    );

    expect(usage.remaining).toBe(4);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.generationCreditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks a generation when the balance is empty', async () => {
    tx.user.findUnique.mockResolvedValue(freeUser(4));

    await expect(
      service.consumeInTransaction(
        tx,
        'user-1',
        GenerationCreditKind.STRATEGY,
        'strategy:run-empty',
      ),
    ).rejects.toMatchObject({ status: 402 });

    try {
      await service.consumeInTransaction(
        tx,
        'user-1',
        GenerationCreditKind.STRATEGY,
        'strategy:run-empty-2',
      );
    } catch (error) {
      const response = (error as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('GENERATION_CREDITS_EXHAUSTED');
    }
    expect(tx.generationCreditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks paid-plan generation while payment needs attention', async () => {
    tx.user.findUnique.mockResolvedValue({
      ...freeUser(1),
      generationCreditLimit: 40,
      generationCreditPlanCode: 'pro',
      subscription: {
        status: SubscriptionStatus.PAST_DUE,
        plan: {
          code: 'pro',
          name: 'Pro',
          active: true,
          generationCredits: 40,
          maxCampaignWeeks: 3,
          maxPostsPerWeek: 6,
          maxPlatforms: 3,
          allowsImageGeneration: true,
        },
      },
    });

    await expect(
      service.consumeInTransaction(
        tx,
        'user-1',
        GenerationCreditKind.CONTENT_WORKFLOW,
        'content-workflow:payment-due',
      ),
    ).rejects.toMatchObject({ status: 402 });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  describe('multi-credit reservations', () => {
    it('reserves one credit per post a content run will produce', async () => {
      const usage = await service.consumeInTransaction(
        tx,
        'user-1',
        GenerationCreditKind.CONTENT_WORKFLOW,
        'content-workflow:run-3',
        3,
      );

      expect(usage).toMatchObject({ limit: 4, used: 3, remaining: 1 });
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', generationCreditsUsed: { lte: 1 } },
        data: { generationCreditsUsed: { increment: 3 } },
      });
      expect(tx.generationCreditEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          referenceId: 'content-workflow:run-3',
          kind: GenerationCreditKind.CONTENT_WORKFLOW,
          amount: 3,
          periodStart,
        },
      });
    });

    it('spends the balance exactly and reports it as spent', async () => {
      const usage = await service.consumeInTransaction(
        tx,
        'user-1',
        GenerationCreditKind.CONTENT_WORKFLOW,
        'content-workflow:run-4',
        4,
      );

      expect(usage).toMatchObject({
        used: 4,
        remaining: 0,
        canGenerate: false,
        blockedReason: 'credits_exhausted',
      });
    });

    // Half a campaign is not something the pipeline can deliver, so a partial
    // balance has to refuse rather than generate as far as the credits reach.
    it('reserves nothing when the balance cannot cover the whole run', async () => {
      tx.user.findUnique.mockResolvedValue(freeUser(2));

      await expect(
        service.consumeInTransaction(
          tx,
          'user-1',
          GenerationCreditKind.CONTENT_WORKFLOW,
          'content-workflow:too-big',
          3,
        ),
      ).rejects.toMatchObject({ status: 402 });

      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.generationCreditEvent.create).not.toHaveBeenCalled();
    });

    it('reports how many credits the refused run needed', async () => {
      tx.user.findUnique.mockResolvedValue(freeUser(2));

      try {
        await service.consumeInTransaction(
          tx,
          'user-1',
          GenerationCreditKind.CONTENT_WORKFLOW,
          'content-workflow:too-big-2',
          3,
        );
        throw new Error('expected a 402');
      } catch (error) {
        const response = (error as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response).toMatchObject({
          code: 'GENERATION_CREDITS_EXHAUSTED',
          required: 3,
        });
        expect(response.message).toContain('needs 3 credits');
        expect(response.message).toContain('you have 2 left');
      }
    });

    it('refunds the whole reservation, not a single credit', async () => {
      tx.generationCreditEvent.findUnique.mockResolvedValue({
        id: 'event-1',
        userId: 'user-1',
        amount: 12,
        periodStart,
        refundedAt: null,
      });
      tx.user.findUnique.mockResolvedValue({
        generationCreditsUsed: 12,
        generationCreditPeriodStart: periodStart,
      });

      await service.refund('content-workflow:cancelled');

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { generationCreditsUsed: { decrement: 12 } },
      });
    });

    it.each([0, -1, 1.5])('refuses a nonsensical amount', async (amount) => {
      await expect(
        service.consumeInTransaction(
          tx,
          'user-1',
          GenerationCreditKind.CONTENT_WORKFLOW,
          `content-workflow:bad-${amount}`,
          amount,
        ),
      ).rejects.toThrow('whole number of credits');
    });
  });

  describe('mid-period plan changes', () => {
    it('tops the allowance up to the new plan without returning spent credits', async () => {
      onPlanChange({ from: pro(35), to: BUSINESS_PLAN });

      const usage = await service.getUsageInTransaction(tx, 'user-1');

      // The 35 already spent stay spent: the upgrade only raises the ceiling,
      // not a second full allowance.
      expect(usage).toMatchObject({
        plan: { code: 'business' },
        limit: 240,
        used: 35,
        remaining: 205,
        canGenerate: true,
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          generationCreditLimit: 240,
          generationCreditPlanCode: 'business',
        },
        select: expect.anything(),
      });
    });

    it('leaves the reset date where it was', async () => {
      onPlanChange({ from: pro(35), to: BUSINESS_PLAN });

      const usage = await service.getUsageInTransaction(tx, 'user-1');

      expect(usage.periodStart).toEqual(periodStart);
      expect(usage.periodEnd).toEqual(periodEnd);
      const [[{ data }]] = tx.user.update.mock.calls;
      expect(data).not.toHaveProperty('generationCreditsUsed');
      expect(data).not.toHaveProperty('generationCreditPeriodStart');
      expect(data).not.toHaveProperty('generationCreditPeriodEnd');
    });

    it('grants a fresh allowance to a user who has spent nothing', async () => {
      onPlanChange({ from: pro(0), to: BUSINESS_PLAN });

      await expect(
        service.getUsageInTransaction(tx, 'user-1'),
      ).resolves.toMatchObject({ limit: 240, used: 0, remaining: 240 });
    });

    it('clamps to zero when a downgrade lands below what is already spent', async () => {
      onPlanChange({
        from: {
          ...pro(100),
          generationCreditLimit: 240,
          generationCreditPlanCode: 'business',
        },
        to: PRO_PLAN,
      });

      const usage = await service.getUsageInTransaction(tx, 'user-1');

      expect(usage).toMatchObject({
        limit: 40,
        used: 40,
        remaining: 0,
        canGenerate: false,
        blockedReason: 'credits_exhausted',
      });
    });

    it('still resets in full when the period has also expired', async () => {
      onPlanChange({
        from: {
          ...pro(35),
          generationCreditPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
        },
        to: BUSINESS_PLAN,
      });

      await service.getUsageInTransaction(tx, 'user-1');

      const [[{ data }]] = tx.user.update.mock.calls;
      expect(data).toMatchObject({
        generationCreditsUsed: 0,
        generationCreditLimit: 240,
        generationCreditPlanCode: 'business',
      });
      expect(data.generationCreditPeriodStart).toBeInstanceOf(Date);
      expect(data.generationCreditPeriodEnd).toBeInstanceOf(Date);
    });

    it('does not touch the row when the plan and period are both unchanged', async () => {
      onPlanChange({ from: pro(35), to: PRO_PLAN });

      await expect(
        service.getUsageInTransaction(tx, 'user-1'),
      ).resolves.toMatchObject({ limit: 40, used: 35, remaining: 5 });
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('applies a changed catalog allowance without resetting usage', async () => {
      onPlanChange({
        from: { ...pro(3), generationCreditLimit: 60 },
        to: PRO_PLAN,
      });

      await expect(
        service.getUsageInTransaction(tx, 'user-1'),
      ).resolves.toMatchObject({ limit: 40, used: 3, remaining: 37 });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          generationCreditLimit: 40,
          generationCreditPlanCode: 'pro',
        },
        select: expect.anything(),
      });
    });

    /**
     * Points the mocked row at `from` and the live subscription at `to`, which
     * is exactly the state right after a plan switch is applied but before the
     * allowance has been synced.
     */
    function onPlanChange({ from, to }: { from: any; to: any }) {
      const row = {
        ...from,
        subscription: { status: SubscriptionStatus.ACTIVE, plan: to },
      };
      tx.user.findUnique.mockResolvedValue(row);
      tx.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...row, ...data }),
      );
    }
  });

  const PRO_PLAN = {
    code: 'pro',
    name: 'Pro',
    active: true,
    generationCredits: 40,
    maxCampaignWeeks: 3,
    maxPostsPerWeek: 6,
    maxPlatforms: 3,
    allowsImageGeneration: true,
  };
  const BUSINESS_PLAN = {
    code: 'business',
    name: 'Business',
    active: true,
    generationCredits: 240,
    maxCampaignWeeks: 4,
    maxPostsPerWeek: 20,
    maxPlatforms: 6,
    allowsImageGeneration: true,
  };

  function pro(used: number) {
    return {
      id: 'user-1',
      generationCreditsUsed: used,
      generationCreditLimit: 40,
      generationCreditPlanCode: 'pro',
      generationCreditPeriodStart: periodStart,
      generationCreditPeriodEnd: periodEnd,
    };
  }

  function freeUser(used: number) {
    return {
      id: 'user-1',
      generationCreditsUsed: used,
      generationCreditLimit: 4,
      generationCreditPlanCode: 'free',
      generationCreditPeriodStart: periodStart,
      generationCreditPeriodEnd: periodEnd,
      subscription: null,
    };
  }
});
