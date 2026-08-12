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
