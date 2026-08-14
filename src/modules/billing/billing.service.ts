import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import {
  BillingInterval,
  PlanChangeKind,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { GenerationCreditsService } from '../generation-credits/generation-credits.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { STRIPE_CLIENT } from './stripe.provider';

/** Stripe statuses mapped onto the application's internal status model. */
export function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELLED;
    case 'incomplete':
      return SubscriptionStatus.INCOMPLETE;
    case 'incomplete_expired':
      return SubscriptionStatus.INCOMPLETE_EXPIRED;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'paused':
      return SubscriptionStatus.PAUSED;
    case 'unpaid':
      return SubscriptionStatus.UNPAID;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

export function toBillingInterval(interval: 'month' | 'year'): BillingInterval {
  return interval === 'month'
    ? BillingInterval.MONTHLY
    : BillingInterval.YEARLY;
}

/**
 * Carries the exact purchase back to the billing page. This lets the browser
 * distinguish a newly purchased plan from the still-active previous plan
 * while Stripe's webhook is being applied.
 */
export function checkoutSuccessUrl(
  configuredUrl: string,
  planCode: string,
  interval: 'month' | 'year',
): string {
  const url = new URL(configuredUrl);
  url.searchParams.set('completedPlan', planCode);
  url.searchParams.set('interval', interval);
  url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  // Stripe replaces this literal placeholder after Checkout. URLSearchParams
  // percent-encodes braces, so restore only this trusted fixed token.
  return url
    .toString()
    .replace(
      encodeURIComponent('{CHECKOUT_SESSION_ID}'),
      '{CHECKOUT_SESSION_ID}',
    );
}

/** Billing period start from a Stripe subscription (v22 nests it on the item). */
export function currentPeriodStart(sub: Stripe.Subscription): Date | undefined {
  const item = sub.items?.data?.[0];
  return item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : undefined;
}

/** Billing period end from a Stripe subscription (v22 nests it on the item). */
export function currentPeriodEnd(sub: Stripe.Subscription): Date | undefined {
  const item = sub.items?.data?.[0];
  return item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : undefined;
}

/** Statuses where Stripe will not accept a plan change until billing is fixed. */
const PAYMENT_BLOCKED_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.PAUSED,
];

/** How long a quoted plan-change price stays honourable. */
const QUOTE_TTL_MS = 15 * 60 * 1000;

export type PlanChangeDirection = PlanChangeKind | 'NOOP';

/**
 * Which way a plan switch runs, which decides whether it is charged now or
 * scheduled for the period end.
 *
 * Tier wins over interval: moving to a bigger plan is an upgrade even when it
 * also shortens the commitment. Only when the tier is identical does the
 * interval decide, where committing to a year is the upgrade and dropping back
 * to a month is the downgrade.
 */
export function classifyPlanChange(
  from: { sortOrder: number; interval: 'month' | 'year' },
  to: { sortOrder: number; interval: 'month' | 'year' },
): PlanChangeDirection {
  if (to.sortOrder > from.sortOrder) return PlanChangeKind.UPGRADE;
  if (to.sortOrder < from.sortOrder) return PlanChangeKind.DOWNGRADE;
  if (from.interval === to.interval) return 'NOOP';
  return to.interval === 'year'
    ? PlanChangeKind.UPGRADE
    : PlanChangeKind.DOWNGRADE;
}

/**
 * Splits a proration preview into the two figures a customer actually asks
 * about: what they got back for the time they had already paid for, and what
 * the new plan costs for the rest of the period.
 */
export function summarizeProration(preview: Stripe.Invoice): {
  unusedCreditCents: number;
  newPlanChargeCents: number;
} {
  let unusedCreditCents = 0;
  let newPlanChargeCents = 0;

  for (const line of preview.lines?.data ?? []) {
    if (line.amount < 0) unusedCreditCents += -line.amount;
    else newPlanChargeCents += line.amount;
  }

  return { unusedCreditCents, newPlanChargeCents };
}

/** The interval a Stripe Price bills on, defaulting to monthly. */
function priceInterval(price: Stripe.Price | undefined): 'month' | 'year' {
  return price?.recurring?.interval === 'year' ? 'year' : 'month';
}

/** Columns that together describe a queued change, cleared as one unit. */
const CLEAR_PENDING_CHANGE = {
  pendingPlanId: null,
  pendingInterval: null,
  pendingEffectiveAt: null,
  stripeScheduleId: null,
} as const;

/**
 * Raised when the local row references a Stripe subscription that Stripe no
 * longer has. Callers recover by sending the customer through a fresh Checkout
 * rather than failing the request.
 */
class StripeSubscriptionMissingError extends Error {}

/** Everything a plan switch needs, resolved once and passed down. */
type PlanChangeContext = {
  subscription: Prisma.SubscriptionGetPayload<object>;
  plan: Prisma.PlanGetPayload<object>;
  priceId: string;
  interval: 'month' | 'year';
  billingInterval: BillingInterval;
  current: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  direction: PlanChangeDirection;
};

export type PlanChangeResult = {
  /** Stripe Checkout URL when payment is required, otherwise null. */
  url: string | null;
  kind?: PlanChangeDirection;
  /** True when the change was queued for the period end instead of applied. */
  scheduled?: boolean;
  effectiveAt?: Date | null;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly generationCredits: GenerationCreditsService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  /** Active plans in display order, with display prices in cents. */
  listPlans() {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        priceMonthlyCents: true,
        priceYearlyCents: true,
        generationCredits: true,
      },
    });
  }

  /** Current monthly generation allowance, including free accounts. */
  getCreditUsage(userId: string) {
    return this.generationCredits.getUsage(userId);
  }

  /** The authenticated user's subscription with its plan, or null. */
  async getSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true, pendingPlan: true },
    });

    if (
      subscription?.status === SubscriptionStatus.INCOMPLETE &&
      subscription.checkoutSessionId &&
      !subscription.stripeSubscriptionId
    ) {
      const session = await this.retrieveCheckoutSessionOrFail(
        subscription.checkoutSessionId,
      );
      if (session.status === 'complete') {
        await this.reconcileCompletedCheckout(userId, subscription, session);
        return this.prisma.subscription.findUnique({
          where: { userId },
          include: { plan: true, pendingPlan: true },
        });
      }
    }

    return subscription;
  }

  /**
   * Creates a Stripe Checkout Session in subscription mode for the user.
   *
   * The Stripe Price is never accepted from the client: the frontend supplies
   * only a plan code + interval, and the Price is resolved from the trusted
   * `plan` table. If the user already has a Stripe Customer it is reused;
   * otherwise one is created and persisted.
   */
  async createCheckoutSession(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<{ url: string | null }> {
    const plan = await this.findActivePlanOrFail(dto.planCode);
    if (plan.code === 'free') {
      throw new BadRequestException(
        'The Free plan is included with every account and does not use checkout',
      );
    }
    const billingInterval = toBillingInterval(dto.interval);
    const priceId =
      dto.interval === 'month'
        ? plan.stripeMonthlyPriceId
        : plan.stripeYearlyPriceId;

    if (!priceId) {
      throw new BadRequestException(
        `Plan "${dto.planCode}" has no configured ${
          dto.interval === 'month' ? 'monthly' : 'yearly'
        } price`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent a second live Stripe subscription: a user who already has an
    // active subscription must switch plans through the plan-change endpoint,
    // which prorates, rather than checking out a brand-new subscription.
    const currentSubscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        planId: true,
        billingInterval: true,
        checkoutSessionId: true,
        status: true,
        stripeSubscriptionId: true,
      },
    });

    if (
      currentSubscription?.stripeSubscriptionId &&
      currentSubscription.status &&
      (
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.UNPAID,
        ] as SubscriptionStatus[]
      ).includes(currentSubscription.status)
    ) {
      throw new ConflictException(
        'You already have an active subscription; use the plan change endpoint to switch plans',
      );
    }

    if (
      currentSubscription?.status === SubscriptionStatus.INCOMPLETE &&
      currentSubscription.checkoutSessionId
    ) {
      const pendingSession = await this.retrieveCheckoutSessionOrFail(
        currentSubscription.checkoutSessionId,
      );

      if (pendingSession.status === 'open') {
        if (
          currentSubscription.planId !== plan.id ||
          currentSubscription.billingInterval !== billingInterval
        ) {
          // Checkout Sessions cannot be edited to replace subscription line
          // items. Expire the stale plan selection so this request can create
          // a fresh session with the requested trusted Price.
          try {
            await this.stripe.checkout.sessions.expire(pendingSession.id);
          } catch (error) {
            this.logger.error(
              `Could not expire stale Checkout Session ${pendingSession.id}`,
              error as Error,
            );
            throw new ServiceUnavailableException(
              'Could not replace the previous checkout, please try again',
            );
          }
        } else {
          if (!pendingSession.url) {
            throw new ServiceUnavailableException(
              'Stripe returned a malformed Checkout Session',
            );
          }

          return { url: pendingSession.url };
        }
      }

      if (pendingSession.status === 'complete') {
        await this.reconcileCompletedCheckout(
          userId,
          currentSubscription,
          pendingSession,
        );
        // The webhook may arrive a little later than the browser redirect.
        // Reconcile from Stripe here, then safely route the new request through
        // the normal prorated plan-change flow instead of blocking the user.
        return this.changePlan(userId, dto);
      }
    }

    const stripeCustomerId = await this.findOrCreateCustomer(userId, user);
    // Every retry for the same local checkout generation uses the same key.
    // Once a session is persisted, its id becomes the next generation key.
    const checkoutGeneration =
      currentSubscription?.checkoutSessionId ?? 'initial';

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: stripeCustomerId,
          line_items: [{ price: priceId, quantity: 1 }],
          // Keep the hosted page focused on card entry. Automatic payment
          // methods otherwise show a collapsed picker (Card, Cash App, Bank),
          // which makes the actual card fields look missing until Card is
          // manually selected. `always` also saves a card when customer credit
          // makes the first invoice free.
          payment_method_types: ['card'],
          payment_method_collection: 'always',
          success_url: checkoutSuccessUrl(
            this.configService.getOrThrow<string>('STRIPE_SUCCESS_URL'),
            plan.code,
            dto.interval,
          ),
          cancel_url:
            this.configService.getOrThrow<string>('STRIPE_CANCEL_URL'),
          client_reference_id: userId,
          metadata: { userId },
          subscription_data: {
            metadata: {
              userId,
              planCode: dto.planCode,
              interval: dto.interval,
            },
          },
        },
        {
          idempotencyKey: `checkout:${userId}:${checkoutGeneration}:${plan.id}:${dto.interval}`,
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to create Stripe Checkout Session',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not start checkout, please try again',
      );
    }

    if (!session.url || !session.id) {
      throw new ServiceUnavailableException(
        'Stripe returned a malformed Checkout Session',
      );
    }

    // Persist the subscription id so the webhook can reconcile regardless of
    // which endpoint the customer finishes on.
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (existing) {
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          planId: plan.id,
          billingInterval,
          stripeCustomerId,
          checkoutSessionId: session.id,
          status: SubscriptionStatus.INCOMPLETE,
          // Reset any previous live subscription so the INCOMPLETE row never
          // references a stale (e.g. previously cancelled) Stripe sub.
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          billingInterval,
          stripeCustomerId,
          checkoutSessionId: session.id,
          status: SubscriptionStatus.INCOMPLETE,
        },
      });
    }

    return { url: session.url };
  }

  /**
   * Prices a plan switch without applying it, and stores the result so the
   * amount the customer confirms is the amount they are charged.
   *
   * An upgrade is priced from Stripe's proration preview. A downgrade owes
   * nothing now — it is scheduled for the end of the period the customer has
   * already paid for — so it quotes zero and reports when it will take effect.
   */
  async previewPlanChange(userId: string, dto: ChangePlanDto) {
    const context = await this.resolvePlanChange(userId, dto);

    if (context.direction === 'NOOP') {
      return this.noopQuote(context);
    }

    const quote = await this.buildQuote(userId, context);
    return this.toQuoteResponse(quote, context);
  }

  /**
   * Applies a plan switch.
   *
   * An upgrade opens a payment-mode Stripe Checkout for the prorated
   * difference; its completion webhook applies the new Price with proration
   * disabled so the customer is never charged twice. A downgrade is scheduled
   * at the period end instead, leaving the higher plan — and the credits that
   * came with it — usable for the time already bought.
   *
   * Returns `{ url }` when payment is needed, or `{ url: null }` with the
   * scheduling details when it is not. Cancelled or in-Stripe-deleted
   * subscriptions are re-subscribed through a fresh Checkout session.
   */
  async changePlan(
    userId: string,
    dto: ChangePlanDto,
  ): Promise<PlanChangeResult> {
    const subscription = await this.findOwnSubscriptionOrFail(userId);

    // Returning to Free is not a plan switch — there is no Price to move to.
    // It ends the paid subscription when the paid period runs out.
    if (dto.planCode === 'free') {
      return this.scheduleReturnToFree(userId, subscription);
    }

    // A cancelled subscription can't be updated in place; the customer
    // re-subscribes through a fresh Checkout instead. A subscription whose
    // Stripe record no longer exists (e.g. cancelled and deleted upstream) is
    // treated the same way.
    if (
      !subscription.stripeSubscriptionId ||
      subscription.status === SubscriptionStatus.CANCELLED
    ) {
      return this.createCheckoutSession(userId, dto);
    }

    let context: PlanChangeContext;
    try {
      context = await this.resolvePlanChange(userId, dto, subscription);
    } catch (error) {
      // The local row points at a Stripe subscription that is gone; start over.
      if (error instanceof StripeSubscriptionMissingError) {
        return this.createCheckoutSession(userId, dto);
      }
      throw error;
    }

    if (context.direction === 'NOOP') {
      return { url: null, kind: 'NOOP', scheduled: false, effectiveAt: null };
    }

    const quote = await this.resolveConfirmedQuote(userId, dto, context);

    return context.direction === PlanChangeKind.DOWNGRADE
      ? this.applyScheduledDowngrade(userId, context, quote)
      : this.applyUpgrade(userId, context, quote);
  }

  /**
   * Drops a scheduled downgrade so the customer stays on the plan they have.
   * Releasing the Stripe schedule leaves the live subscription untouched.
   */
  async cancelPendingPlanChange(userId: string) {
    const subscription = await this.findOwnSubscriptionOrFail(userId);

    if (!subscription.pendingPlanId) {
      throw new ConflictException('There is no scheduled plan change to undo');
    }

    try {
      if (subscription.stripeScheduleId) {
        await this.stripe.subscriptionSchedules.release(
          subscription.stripeScheduleId,
        );
      } else if (
        subscription.cancelAtPeriodEnd &&
        subscription.stripeSubscriptionId
      ) {
        await this.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: false },
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to release the scheduled plan change',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not undo the scheduled change, please try again',
      );
    }

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        ...CLEAR_PENDING_CHANGE,
        cancelAtPeriodEnd: false,
      },
    });

    return this.getSubscription(userId);
  }

  /**
   * Loads everything a plan switch needs and decides which way it runs.
   * Throws `StripeSubscriptionMissingError` when Stripe no longer knows about
   * the subscription, which callers translate into a fresh Checkout.
   */
  private async resolvePlanChange(
    userId: string,
    dto: ChangePlanDto,
    preloaded?: Prisma.SubscriptionGetPayload<object>,
  ): Promise<PlanChangeContext> {
    const subscription =
      preloaded ?? (await this.findOwnSubscriptionOrFail(userId));
    const plan = await this.findActivePlanOrFail(dto.planCode);

    if (plan.code === 'free') {
      throw new BadRequestException(
        'The Free plan has no price to switch to; cancel the paid plan instead',
      );
    }

    const priceId =
      dto.interval === 'month'
        ? plan.stripeMonthlyPriceId
        : plan.stripeYearlyPriceId;

    if (!priceId) {
      throw new BadRequestException(
        `Plan "${dto.planCode}" has no configured ${
          dto.interval === 'month' ? 'monthly' : 'yearly'
        } price`,
      );
    }

    if (!subscription.stripeSubscriptionId) {
      throw new StripeSubscriptionMissingError();
    }

    // Stripe refuses plan changes while an invoice is unpaid, and silently
    // letting the customer try produces an opaque failure. Send them to the
    // portal to fix the payment method first.
    if (PAYMENT_BLOCKED_STATUSES.includes(subscription.status)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SUBSCRIPTION_PAYMENT_REQUIRED',
        message:
          'Update your payment details before changing plan. Your last payment did not go through.',
        portalRequired: true,
      });
    }

    let current: Stripe.Subscription;
    try {
      current = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
    } catch {
      throw new StripeSubscriptionMissingError();
    }

    const item = current.items.data[0];
    if (!item) {
      throw new ConflictException('Stripe subscription has no items');
    }

    const fromPlan = subscription.planId
      ? await this.prisma.plan.findUnique({
          where: { id: subscription.planId },
        })
      : null;

    const direction =
      item.price.id === priceId
        ? 'NOOP'
        : classifyPlanChange(
            {
              sortOrder: fromPlan?.sortOrder ?? 0,
              interval: priceInterval(item.price),
            },
            { sortOrder: plan.sortOrder, interval: dto.interval },
          );

    return {
      subscription,
      plan,
      priceId,
      interval: dto.interval,
      billingInterval: toBillingInterval(dto.interval),
      current,
      item,
      direction,
    };
  }

  /** Prices the switch and persists it as a single-use quote. */
  private async buildQuote(userId: string, context: PlanChangeContext) {
    const { subscription, plan, priceId, current, item, direction } = context;
    const credits = await this.generationCredits.getUsage(userId);
    const periodEnd =
      currentPeriodEnd(current) ?? subscription.currentPeriodEnd;

    let amountDueCents = 0;
    let currency = item.price.currency;
    let unusedCreditCents = 0;
    let newPlanChargeCents = 0;

    if (direction === PlanChangeKind.UPGRADE) {
      const preview = await this.previewProration(current.id, item.id, priceId);
      const split = summarizeProration(preview);
      amountDueCents = Math.max(0, preview.total);
      currency = preview.currency;
      unusedCreditCents = split.unusedCreditCents;
      newPlanChargeCents = split.newPlanChargeCents;
    }

    return this.prisma.planChangeQuote.create({
      data: {
        subscriptionId: subscription.id,
        userId,
        kind: direction as PlanChangeKind,
        planId: plan.id,
        interval: context.billingInterval,
        fromPriceId: item.price.id,
        targetPriceId: priceId,
        amountDueCents,
        currency,
        unusedCreditCents,
        newPlanChargeCents,
        creditsLimit: credits.limit,
        creditsUsed: credits.used,
        creditsNewLimit: plan.generationCredits,
        effectiveAt: direction === PlanChangeKind.DOWNGRADE ? periodEnd : null,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
    });
  }

  /**
   * Returns the quote the customer confirmed, or a `409` carrying a fresh one
   * when the figure they saw no longer holds — so a moved price is always
   * re-confirmed rather than silently charged.
   */
  private async resolveConfirmedQuote(
    userId: string,
    dto: ChangePlanDto,
    context: PlanChangeContext,
  ) {
    if (!dto.quoteId) {
      return this.buildQuote(userId, context);
    }

    const stored = await this.prisma.planChangeQuote.findUnique({
      where: { id: dto.quoteId },
    });

    const stale =
      !stored ||
      stored.userId !== userId ||
      stored.consumedAt !== null ||
      stored.expiresAt <= new Date() ||
      stored.targetPriceId !== context.priceId ||
      stored.fromPriceId !== context.item.price.id ||
      stored.kind !== context.direction;

    if (stale) {
      const fresh = await this.buildQuote(userId, context);
      throw new ConflictException({
        statusCode: 409,
        code: 'PLAN_CHANGE_QUOTE_STALE',
        message:
          'The price for this change has been recalculated. Please review and confirm it again.',
        quote: this.toQuoteResponse(fresh, context),
      });
    }

    return stored;
  }

  /** Opens Stripe Checkout for the prorated difference on an upgrade. */
  private async applyUpgrade(
    userId: string,
    context: PlanChangeContext,
    quote: { id: string; amountDueCents: number; currency: string },
  ): Promise<PlanChangeResult> {
    const { subscription, plan, priceId, current, item } = context;

    // An upgrade supersedes anything the customer had queued for the period
    // end, otherwise the schedule would quietly undo the plan they just paid for.
    await this.releasePendingSchedule(userId, subscription);

    try {
      if (quote.amountDueCents <= 0) {
        // Nothing to collect — usually an upgrade so late in the period that
        // the unused credit covers it. Apply it directly.
        const updated = await this.stripe.subscriptions.update(
          current.id,
          {
            items: [{ id: item.id, price: priceId }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',
          },
          {
            idempotencyKey: `change-plan:${current.id}:${item.price.id}:${priceId}`,
          },
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { userId },
            data: {
              planId: plan.id,
              billingInterval: context.billingInterval,
              stripePriceId: priceId,
              status: mapSubscriptionStatus(updated.status),
              currentPeriodStart: currentPeriodStart(updated),
              currentPeriodEnd: currentPeriodEnd(updated),
              ...CLEAR_PENDING_CHANGE,
            },
          });
          await tx.planChangeQuote.update({
            where: { id: quote.id },
            data: { consumedAt: new Date() },
          });
          // Raise the allowance to the new plan in the same transaction that
          // applies the plan, so the two can never disagree.
          await this.generationCredits.getUsageInTransaction(tx, userId);
        });

        return {
          url: null,
          kind: PlanChangeKind.UPGRADE,
          scheduled: false,
          effectiveAt: null,
        };
      }

      const stripeCustomerId =
        subscription.stripeCustomerId ??
        (typeof current.customer === 'string'
          ? current.customer
          : current.customer?.id);

      if (!stripeCustomerId) {
        throw new ServiceUnavailableException(
          'Stripe subscription has no billing customer',
        );
      }

      // Subscription updates normally charge a saved card immediately. Use a
      // payment-mode Checkout Session instead so every paid upgrade opens
      // Stripe's hosted payment-details page. The webhook changes the Price
      // only after this payment succeeds.
      const checkout = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: quote.currency,
                product_data: {
                  name: `${plan.name} plan upgrade`,
                  description: 'Prorated plan difference',
                },
                unit_amount: quote.amountDueCents,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            setup_future_usage: 'off_session',
            metadata: {
              billingFlow: 'plan_change',
              userId,
              stripeSubscriptionId: current.id,
              sourcePriceId: item.price.id,
              targetPriceId: priceId,
            },
          },
          success_url: checkoutSuccessUrl(
            this.configService.getOrThrow<string>('STRIPE_SUCCESS_URL'),
            plan.code,
            context.interval,
          ),
          cancel_url:
            this.configService.getOrThrow<string>('STRIPE_CANCEL_URL'),
          client_reference_id: userId,
          metadata: {
            billingFlow: 'plan_change',
            userId,
            planId: plan.id,
            interval: context.interval,
            quoteId: quote.id,
            stripeSubscriptionId: current.id,
            sourcePriceId: item.price.id,
            targetPriceId: priceId,
          },
        },
        {
          idempotencyKey: `plan-change-checkout:${current.id}:${item.price.id}:${priceId}:${quote.id}`,
        },
      );

      if (!checkout.url) {
        throw new ServiceUnavailableException(
          'Stripe did not return a payment URL for the plan change',
        );
      }

      // Spend the quote as soon as it has a payment attached to it, so a second
      // tab cannot open a second Checkout against the same quoted figure.
      await this.prisma.planChangeQuote.update({
        where: { id: quote.id },
        data: { consumedAt: new Date() },
      });

      return {
        url: checkout.url,
        kind: PlanChangeKind.UPGRADE,
        scheduled: false,
        effectiveAt: null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        'Failed to change Stripe subscription plan',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not change plan, please try again',
      );
    }
  }

  /**
   * Queues a downgrade for the end of the paid period using a Stripe
   * Subscription Schedule. Nothing is invoiced and nothing changes today, so
   * the customer keeps the plan and the credits they already paid for.
   */
  private async applyScheduledDowngrade(
    userId: string,
    context: PlanChangeContext,
    quote: { id: string },
  ): Promise<PlanChangeResult> {
    const { subscription, plan, priceId, current } = context;

    try {
      const schedule = await this.upsertSchedule(
        current.id,
        subscription.stripeScheduleId,
        priceId,
      );
      const effectiveAt =
        currentPeriodEnd(current) ?? subscription.currentPeriodEnd ?? null;

      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { userId },
          data: {
            pendingPlanId: plan.id,
            pendingInterval: context.billingInterval,
            pendingEffectiveAt: effectiveAt,
            stripeScheduleId: schedule.id,
          },
        });
        await tx.planChangeQuote.update({
          where: { id: quote.id },
          data: { consumedAt: new Date() },
        });
      });

      return {
        url: null,
        kind: PlanChangeKind.DOWNGRADE,
        scheduled: true,
        effectiveAt,
      };
    } catch (error) {
      this.logger.error('Failed to schedule the downgrade', error as Error);
      throw new ServiceUnavailableException(
        'Could not schedule the plan change, please try again',
      );
    }
  }

  /**
   * Creates or rewrites the schedule so the current price runs to the end of
   * the paid period and the target price takes over from there.
   */
  private async upsertSchedule(
    stripeSubscriptionId: string,
    existingScheduleId: string | null,
    targetPriceId: string,
  ): Promise<Stripe.SubscriptionSchedule> {
    const schedule = existingScheduleId
      ? await this.stripe.subscriptionSchedules.retrieve(existingScheduleId)
      : await this.stripe.subscriptionSchedules.create({
          from_subscription: stripeSubscriptionId,
        });

    // A schedule can carry completed phases; the one to preserve is whichever
    // is running right now.
    const activePhase =
      schedule.phases.find(
        (phase) => phase.start_date === schedule.current_phase?.start_date,
      ) ?? schedule.phases[0];

    if (!activePhase) {
      throw new ServiceUnavailableException(
        'Stripe schedule has no active phase',
      );
    }

    return this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          start_date: activePhase.start_date,
          end_date: activePhase.end_date,
          items: activePhase.items.map((item) => ({
            price: typeof item.price === 'string' ? item.price : item.price.id,
            quantity: item.quantity ?? 1,
          })),
        },
        // Open-ended: once the paid period runs out the customer simply renews
        // on the cheaper price from then on. Nothing is prorated into it.
        {
          items: [{ price: targetPriceId, quantity: 1 }],
          proration_behavior: 'none',
        },
      ],
    });
  }

  /**
   * Returning to Free ends the paid subscription when the period the customer
   * already bought runs out, rather than cutting access off mid-period.
   */
  private async scheduleReturnToFree(
    userId: string,
    subscription: Prisma.SubscriptionGetPayload<object>,
  ): Promise<PlanChangeResult> {
    if (
      !subscription.stripeSubscriptionId ||
      subscription.status === SubscriptionStatus.CANCELLED
    ) {
      throw new ConflictException('There is no paid subscription to end');
    }

    const freePlan = await this.prisma.plan.findFirst({
      where: { code: 'free', active: true },
    });

    try {
      await this.releasePendingSchedule(userId, subscription);
      const updated = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
      const effectiveAt =
        currentPeriodEnd(updated) ?? subscription.currentPeriodEnd ?? null;

      await this.prisma.subscription.update({
        where: { userId },
        data: {
          cancelAtPeriodEnd: true,
          pendingPlanId: freePlan?.id ?? null,
          pendingInterval: null,
          pendingEffectiveAt: effectiveAt,
        },
      });

      return {
        url: null,
        kind: PlanChangeKind.DOWNGRADE,
        scheduled: true,
        effectiveAt,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(
        'Failed to schedule the return to the Free plan',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not schedule the plan change, please try again',
      );
    }
  }

  /** Drops any queued downgrade so a newly applied plan is not undone later. */
  private async releasePendingSchedule(
    userId: string,
    subscription: {
      stripeScheduleId: string | null;
      pendingPlanId: string | null;
    },
  ): Promise<void> {
    if (!subscription.pendingPlanId && !subscription.stripeScheduleId) return;

    if (subscription.stripeScheduleId) {
      try {
        await this.stripe.subscriptionSchedules.release(
          subscription.stripeScheduleId,
        );
      } catch (error) {
        // An already-released schedule is the state we want; keep going.
        this.logger.warn(
          `Could not release schedule ${subscription.stripeScheduleId}`,
          error as Error,
        );
      }
    }

    await this.prisma.subscription.update({
      where: { userId },
      data: CLEAR_PENDING_CHANGE,
    });
  }

  private previewProration(
    stripeSubscriptionId: string,
    itemId: string,
    priceId: string,
  ) {
    return this.stripe.invoices.createPreview({
      subscription: stripeSubscriptionId,
      subscription_details: {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'always_invoice',
      },
    });
  }

  /** Shapes a stored quote for the client. */
  private toQuoteResponse(
    quote: Prisma.PlanChangeQuoteGetPayload<object>,
    context: PlanChangeContext,
  ) {
    return {
      quoteId: quote.id,
      kind: quote.kind,
      amountDueCents: quote.amountDueCents,
      currency: quote.currency,
      isCredit: quote.kind === PlanChangeKind.DOWNGRADE,
      effectiveAt: quote.effectiveAt,
      expiresAt: quote.expiresAt,
      breakdown: {
        unusedCreditCents: quote.unusedCreditCents,
        newPlanChargeCents: quote.newPlanChargeCents,
      },
      credits: {
        limit: quote.creditsLimit,
        used: quote.creditsUsed,
        newLimit: quote.creditsNewLimit,
        newRemaining: Math.max(0, quote.creditsNewLimit - quote.creditsUsed),
        periodEnd: context.subscription.currentPeriodEnd,
      },
    };
  }

  /** The response for "you are already on this plan". */
  private async noopQuote(context: PlanChangeContext) {
    const credits = await this.generationCredits.getUsage(
      context.subscription.userId,
    );
    return {
      quoteId: null,
      kind: 'NOOP' as const,
      amountDueCents: 0,
      currency: context.item.price.currency,
      isCredit: false,
      effectiveAt: null,
      expiresAt: null,
      breakdown: { unusedCreditCents: 0, newPlanChargeCents: 0 },
      credits: {
        limit: credits.limit,
        used: credits.used,
        newLimit: credits.limit,
        newRemaining: credits.remaining,
        periodEnd: context.subscription.currentPeriodEnd,
      },
    };
  }

  /**
   * Immediately cancels the Stripe subscription (not at period end) and
   * reflects it in PostgreSQL. The webhook finalizes Stripe state.
   */
  async cancelSubscription(userId: string) {
    const subscription = await this.findOwnSubscriptionOrFail(userId);

    if (!subscription.stripeSubscriptionId) {
      throw new ConflictException('No active Stripe subscription to cancel');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictException('Subscription is already cancelled');
    }

    try {
      const canceled = await this.stripe.subscriptions.cancel(
        subscription.stripeSubscriptionId,
      );

      await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: mapSubscriptionStatus(canceled.status),
          cancelAtPeriodEnd: false,
          canceledAt: canceled.status === 'canceled' ? new Date() : undefined,
        },
      });
    } catch (error) {
      this.logger.error('Failed to cancel Stripe subscription', error as Error);
      throw new ServiceUnavailableException(
        'Could not cancel subscription, please try again',
      );
    }

    return this.getSubscription(userId);
  }

  async createBillingPortal(userId: string): Promise<{ url: string }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!subscription?.stripeCustomerId) {
      throw new ConflictException(
        'No billing account exists yet; choose a paid plan first',
      );
    }

    try {
      const portal = await this.stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${this.configService.getOrThrow<string>('app.frontendUrl')}/settings#billing`,
      });
      return { url: portal.url };
    } catch (error) {
      this.logger.error(
        'Failed to create Stripe billing portal',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not open payment settings, please try again',
      );
    }
  }

  private async findActivePlanOrFail(planCode: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { code: planCode, active: true },
    });

    if (!plan) {
      throw new NotFoundException(`Plan "${planCode}" not found`);
    }

    return plan;
  }

  private async findOwnSubscriptionOrFail(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found for this user');
    }

    return subscription;
  }

  /**
   * One Stripe Customer per application user. Reuses the persisted id when
   * available, otherwise creates the customer and stores its id.
   */
  private async findOrCreateCustomer(
    userId: string,
    user: { id: string; email: string; name: string },
  ): Promise<string> {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });

    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }

    try {
      const customer = await this.stripe.customers.create(
        {
          email: user.email,
          name: user.name,
          metadata: { userId },
        },
        { idempotencyKey: `billing-customer:${userId}` },
      );

      // Persist immediately so a failed Checkout never re-creates customers.
      await this.prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: customer.id,
          status: SubscriptionStatus.INCOMPLETE,
        },
        update: { stripeCustomerId: customer.id },
      });

      return customer.id;
    } catch (error) {
      this.logger.error('Failed to create Stripe Customer', error as Error);
      throw new ServiceUnavailableException(
        'Could not create billing customer, please try again',
      );
    }
  }

  private async retrieveCheckoutSessionOrFail(
    checkoutSessionId: string,
  ): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(checkoutSessionId);
    } catch (error) {
      this.logger.error(
        `Could not inspect pending Checkout Session ${checkoutSessionId}`,
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not verify the pending checkout, please try again',
      );
    }
  }

  private async reconcileCompletedCheckout(
    userId: string,
    local: {
      planId: string | null;
      billingInterval: BillingInterval | null;
    },
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId || !local.planId || !local.billingInterval) {
      throw new ServiceUnavailableException(
        'Stripe completed checkout without subscription details; please try again',
      );
    }

    let remote: Stripe.Subscription;
    try {
      remote = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      this.logger.error(
        `Could not retrieve completed Stripe subscription ${subscriptionId}`,
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not confirm the completed subscription, please try again',
      );
    }

    const priceId = remote.items.data[0]?.price?.id;
    if (!priceId) {
      throw new ServiceUnavailableException(
        'Stripe completed checkout without a subscription price',
      );
    }

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        planId: local.planId,
        billingInterval: local.billingInterval,
        stripeSubscriptionId: remote.id,
        stripePriceId: priceId,
        status: mapSubscriptionStatus(remote.status),
        currentPeriodStart: currentPeriodStart(remote),
        currentPeriodEnd: currentPeriodEnd(remote),
        cancelAtPeriodEnd: remote.cancel_at_period_end,
        canceledAt: remote.canceled_at
          ? new Date(remote.canceled_at * 1000)
          : null,
      },
    });
  }
}
