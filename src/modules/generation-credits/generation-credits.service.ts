import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationCreditKind,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export type GenerationCreditUsage = {
  plan: {
    code: string;
    name: string;
    maxCampaignWeeks: number | null;
    maxPostsPerWeek: number | null;
    maxPlatforms: number | null;
    allowsImageGeneration: boolean;
  };
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  canGenerate: boolean;
  blockedReason: 'payment_required' | 'credits_exhausted' | null;
};

type CreditUser = {
  id: string;
  generationCreditsUsed: number;
  generationCreditLimit: number;
  generationCreditPlanCode: string | null;
  generationCreditPeriodStart: Date | null;
  generationCreditPeriodEnd: Date | null;
  subscription: {
    status: SubscriptionStatus;
    plan: {
      code: string;
      name: string;
      active: boolean;
      generationCredits: number;
      maxCampaignWeeks: number | null;
      maxPostsPerWeek: number | null;
      maxPlatforms: number | null;
      allowsImageGeneration: boolean;
    } | null;
  } | null;
};

type CreditTransaction = Prisma.TransactionClient;

const PAID_ACCESS_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
];

const PAYMENT_BLOCKED_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.PAUSED,
];

/** Every field `syncAllowance` needs to recompute an entitlement. */
const CREDIT_USER_SELECT = {
  id: true,
  generationCreditsUsed: true,
  generationCreditLimit: true,
  generationCreditPlanCode: true,
  generationCreditPeriodStart: true,
  generationCreditPeriodEnd: true,
  subscription: {
    select: {
      status: true,
      plan: {
        select: {
          code: true,
          name: true,
          active: true,
          generationCredits: true,
          maxCampaignWeeks: true,
          maxPostsPerWeek: true,
          maxPlatforms: true,
          allowsImageGeneration: true,
        },
      },
    },
  },
} as const;

/**
 * Owns the fixed workflow allowance advertised by the pricing plans.
 *
 * A database row lock serialises balance changes for one user. This prevents
 * two simultaneous tabs from both spending the final credit. Reservations are
 * stored with a unique reference so retries cannot be charged twice.
 */
@Injectable()
export class GenerationCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  getUsage(userId: string): Promise<GenerationCreditUsage> {
    return this.prisma.$transaction((tx) =>
      this.getUsageInTransaction(tx, userId),
    );
  }

  async getUsageInTransaction(
    tx: CreditTransaction,
    userId: string,
  ): Promise<GenerationCreditUsage> {
    await this.lockUser(tx, userId);
    return this.syncAllowance(tx, userId);
  }

  /**
   * Reserves `amount` credits for one generation. A content run costs one credit
   * per post it will produce, so this has to move the balance by more than one
   * at a time; the whole reservation succeeds or none of it does, because half
   * a campaign is not a thing the pipeline can deliver.
   */
  async consumeInTransaction(
    tx: CreditTransaction,
    userId: string,
    kind: GenerationCreditKind,
    referenceId: string,
    amount = 1,
  ): Promise<GenerationCreditUsage> {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new BadRequestException(
        'A generation must reserve a whole number of credits',
      );
    }

    await this.lockUser(tx, userId);

    const existing = await tx.generationCreditEvent.findUnique({
      where: { referenceId },
      select: { id: true },
    });
    const usage = await this.syncAllowance(tx, userId);
    if (existing) return usage;

    if (usage.blockedReason === 'payment_required') {
      this.throwUnavailable(
        'SUBSCRIPTION_PAYMENT_REQUIRED',
        'Your subscription needs attention before another generation can start.',
        usage,
      );
    }
    if (usage.remaining < amount) {
      this.throwUnavailable(
        'GENERATION_CREDITS_EXHAUSTED',
        insufficientCreditsMessage(amount, usage.remaining),
        usage,
        amount,
      );
    }

    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        generationCreditsUsed: { lte: usage.limit - amount },
      },
      data: { generationCreditsUsed: { increment: amount } },
    });
    if (claimed.count !== 1) {
      this.throwUnavailable(
        'GENERATION_CREDITS_EXHAUSTED',
        insufficientCreditsMessage(amount, 0),
        {
          ...usage,
          used: usage.limit,
          remaining: 0,
          canGenerate: false,
          blockedReason: 'credits_exhausted',
        },
        amount,
      );
    }

    await tx.generationCreditEvent.create({
      data: {
        userId,
        referenceId,
        kind,
        amount,
        periodStart: usage.periodStart,
      },
    });

    const used = usage.used + amount;
    return {
      ...usage,
      used,
      remaining: Math.max(0, usage.limit - used),
      canGenerate: used < usage.limit,
      blockedReason: used < usage.limit ? null : 'credits_exhausted',
    };
  }

  async refund(referenceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.generationCreditEvent.findUnique({
        where: { referenceId },
      });
      if (!event || event.refundedAt) return;

      await this.lockUser(tx, event.userId);
      const user = await tx.user.findUnique({
        where: { id: event.userId },
        select: {
          generationCreditsUsed: true,
          generationCreditPeriodStart: true,
        },
      });

      await tx.generationCreditEvent.update({
        where: { id: event.id },
        data: { refundedAt: new Date() },
      });

      if (
        user &&
        user.generationCreditsUsed > 0 &&
        user.generationCreditPeriodStart?.getTime() ===
          event.periodStart.getTime()
      ) {
        await tx.user.update({
          where: { id: event.userId },
          data: { generationCreditsUsed: { decrement: event.amount } },
        });
      }
    });
  }

  private async syncAllowance(
    tx: CreditTransaction,
    userId: string,
  ): Promise<GenerationCreditUsage> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: CREDIT_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');

    const paidPlan = user.subscription?.plan?.active
      ? user.subscription.plan
      : null;
    const hasPaidAccess = Boolean(
      paidPlan && PAID_ACCESS_STATUSES.includes(user.subscription!.status),
    );
    const paymentBlocked = Boolean(
      paidPlan && PAYMENT_BLOCKED_STATUSES.includes(user.subscription!.status),
    );
    const freePlan =
      !hasPaidAccess && !paymentBlocked
        ? await tx.plan.findFirst({
            where: { code: 'free', active: true },
            select: {
              code: true,
              name: true,
              active: true,
              generationCredits: true,
              maxCampaignWeeks: true,
              maxPostsPerWeek: true,
              maxPlatforms: true,
              allowsImageGeneration: true,
            },
          })
        : null;
    const plan = (hasPaidAccess || paymentBlocked ? paidPlan : freePlan) ?? {
      code: 'free',
      name: 'Free',
      active: true,
      generationCredits: 0,
      maxCampaignWeeks: 1,
      maxPostsPerWeek: 3,
      maxPlatforms: 1,
      allowsImageGeneration: false,
    };
    const now = new Date();
    const periodExpired =
      !user.generationCreditPeriodEnd || user.generationCreditPeriodEnd <= now;
    const missingPeriod =
      !user.generationCreditPeriodStart || !user.generationCreditPeriodEnd;
    const planChanged = user.generationCreditPlanCode !== plan.code;
    const allowanceChanged =
      user.generationCreditLimit !== Math.max(0, plan.generationCredits);

    let synced: CreditUser = user;
    if (periodExpired || missingPeriod) {
      // A genuine rollover: the allowance starts over on a fresh window. This
      // also covers a plan change that happens to land on an expired period —
      // the rollover wins, so the user is never charged twice for the reset.
      const periodStart = now;
      const periodEnd = addOneMonth(periodStart);
      synced = await tx.user.update({
        where: { id: userId },
        data: {
          generationCreditsUsed: 0,
          generationCreditLimit: Math.max(0, plan.generationCredits),
          generationCreditPlanCode: plan.code,
          generationCreditPeriodStart: periodStart,
          generationCreditPeriodEnd: periodEnd,
        },
        select: CREDIT_USER_SELECT,
      });
    } else if (planChanged || allowanceChanged) {
      // Mid-period plan or catalog change: move the allowance to the current
      // ceiling and leave everything else alone. Resetting `generationCreditsUsed` here
      // would hand back every credit already spent, so cycling plans would mint
      // credits for the price of a proration; restarting the period would push
      // the reset date forward on every switch. Keeping both means an upgrade
      // grants exactly the difference, and a downgrade below what is already
      // spent simply leaves nothing remaining (clamped below) until the period
      // ends on its original date.
      synced = await tx.user.update({
        where: { id: userId },
        data: {
          generationCreditLimit: Math.max(0, plan.generationCredits),
          generationCreditPlanCode: plan.code,
        },
        select: CREDIT_USER_SELECT,
      });
    }

    const limit = synced.generationCreditLimit;
    const used = Math.min(synced.generationCreditsUsed, limit);
    const remaining = Math.max(0, limit - used);
    const blockedReason = paymentBlocked
      ? 'payment_required'
      : remaining === 0
        ? 'credits_exhausted'
        : null;

    return {
      plan: {
        code: plan.code,
        name: plan.name,
        maxCampaignWeeks: plan.maxCampaignWeeks,
        maxPostsPerWeek: plan.maxPostsPerWeek,
        maxPlatforms: plan.maxPlatforms,
        allowsImageGeneration: plan.allowsImageGeneration,
      },
      limit,
      used,
      remaining,
      periodStart: synced.generationCreditPeriodStart!,
      periodEnd: synced.generationCreditPeriodEnd!,
      canGenerate: blockedReason === null,
      blockedReason,
    };
  }

  private async lockUser(tx: CreditTransaction, userId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException('User not found');
  }

  private throwUnavailable(
    code: string,
    message: string,
    credits: GenerationCreditUsage,
    required?: number,
  ): never {
    throw new HttpException(
      { statusCode: 402, code, message, credits, required },
      402,
    );
  }
}

function insufficientCreditsMessage(required: number, remaining: number): string {
  const cost = `${required} ${required === 1 ? 'credit' : 'credits'}`;
  return `This generation needs ${cost} and you have ${remaining} left. Upgrade your plan, shorten the campaign, or wait for the next reset.`;
}

function addOneMonth(value: Date): Date {
  const next = new Date(value);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
