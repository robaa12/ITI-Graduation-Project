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
          generationCredits: 6,
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
      limit: 6,
      used: 1,
      remaining: 5,
      canGenerate: true,
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', generationCreditsUsed: { lt: 6 } },
      data: { generationCreditsUsed: { increment: 1 } },
    });
    expect(tx.generationCreditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        referenceId: 'strategy:run-1',
        kind: GenerationCreditKind.STRATEGY,
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

    expect(usage.remaining).toBe(6);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.generationCreditEvent.create).not.toHaveBeenCalled();
  });

  it('blocks a generation when the balance is empty', async () => {
    tx.user.findUnique.mockResolvedValue(freeUser(6));

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
      generationCreditLimit: 60,
      generationCreditPlanCode: 'pro',
      subscription: {
        status: SubscriptionStatus.PAST_DUE,
        plan: {
          code: 'pro',
          name: 'Pro',
          active: true,
          generationCredits: 60,
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

  describe('mid-period plan changes', () => {
    it('tops the allowance up to the new plan without returning spent credits', async () => {
      onPlanChange({ from: pro(55), to: BUSINESS_PLAN });

      const usage = await service.getUsageInTransaction(tx, 'user-1');

      // The 55 already spent stay spent: the upgrade buys the 180 difference,
      // not a second full allowance.
      expect(usage).toMatchObject({
        plan: { code: 'business' },
        limit: 240,
        used: 55,
        remaining: 185,
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
      onPlanChange({ from: pro(55), to: BUSINESS_PLAN });

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
        limit: 60,
        used: 60,
        remaining: 0,
        canGenerate: false,
        blockedReason: 'credits_exhausted',
      });
    });

    it('still resets in full when the period has also expired', async () => {
      onPlanChange({
        from: {
          ...pro(55),
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
      onPlanChange({ from: pro(55), to: PRO_PLAN });

      await expect(
        service.getUsageInTransaction(tx, 'user-1'),
      ).resolves.toMatchObject({ limit: 60, used: 55, remaining: 5 });
      expect(tx.user.update).not.toHaveBeenCalled();
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
    generationCredits: 60,
  };
  const BUSINESS_PLAN = {
    code: 'business',
    name: 'Business',
    active: true,
    generationCredits: 240,
  };

  function pro(used: number) {
    return {
      id: 'user-1',
      generationCreditsUsed: used,
      generationCreditLimit: 60,
      generationCreditPlanCode: 'pro',
      generationCreditPeriodStart: periodStart,
      generationCreditPeriodEnd: periodEnd,
    };
  }

  function freeUser(used: number) {
    return {
      id: 'user-1',
      generationCreditsUsed: used,
      generationCreditLimit: 6,
      generationCreditPlanCode: 'free',
      generationCreditPeriodStart: periodStart,
      generationCreditPeriodEnd: periodEnd,
      subscription: null,
    };
  }
});
