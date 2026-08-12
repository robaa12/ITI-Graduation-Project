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
import { BillingInterval, SubscriptionStatus } from '@prisma/client';
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
      include: { plan: true },
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
          include: { plan: true },
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
          throw new ConflictException(
            'A checkout for another plan is already in progress',
          );
        }

        if (!pendingSession.url) {
          throw new ServiceUnavailableException(
            'Stripe returned a malformed Checkout Session',
          );
        }

        return { url: pendingSession.url };
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
          success_url:
            this.configService.getOrThrow<string>('STRIPE_SUCCESS_URL'),
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
          idempotencyKey: `checkout:${userId}:${checkoutGeneration}`,
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
   * Changes the current plan and bills the prorated difference through a
   * Stripe-hosted invoice the customer must pay before the change completes
   * (`proration_behavior: always_invoice`). Only the new plan's trusted Prices
   * are accepted — never arbitrary ids.
   *
   * Returns `{ url }` when there is an amount due (the customer is redirected
   * to Stripe to pay the difference) or `{ url: null }` when the switch is a
   * pure downgrade/credit with nothing to pay. Cancelled or in-Stripe-deleted
   * subscriptions are re-subscribed through a fresh Checkout session instead.
   */
  async changePlan(
    userId: string,
    dto: ChangePlanDto,
  ): Promise<{ url: string | null }> {
    const subscription = await this.findOwnSubscriptionOrFail(userId);
    const plan = await this.findActivePlanOrFail(dto.planCode);
    if (plan.code === 'free') {
      throw new BadRequestException(
        'Cancel the paid subscription to return to the Free plan',
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

    let current: Stripe.Subscription;
    try {
      current = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
    } catch {
      return this.createCheckoutSession(userId, dto);
    }

    const item = current.items.data[0];

    if (!item) {
      throw new ConflictException('Stripe subscription has no items');
    }

    if (current.pending_update) {
      throw new ConflictException(
        'A subscription plan change is already awaiting payment',
      );
    }

    if (item.price.id === priceId) {
      return { url: null };
    }

    try {
      const updated = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: [{ id: item.id, price: priceId }],
          // Invoice the prorated difference immediately and keep the change
          // pending until the customer pays it on Stripe's hosted page.
          proration_behavior: 'always_invoice',
          payment_behavior: 'pending_if_incomplete',
        },
        {
          idempotencyKey: `change-plan:${subscription.stripeSubscriptionId}:${item.price.id}:${priceId}`,
        },
      );

      const invoice = await this.resolveLatestInvoice(updated);

      // An amount due means the customer must confirm the switch by paying the
      // difference on Stripe's hosted invoice page.
      if (
        updated.pending_update ||
        (invoice && invoice.amount_due > 0 && invoice.status !== 'paid')
      ) {
        if (!invoice?.hosted_invoice_url) {
          throw new ServiceUnavailableException(
            'Stripe did not return a payment URL for the pending plan change',
          );
        }

        return { url: invoice.hosted_invoice_url };
      }

      await this.prisma.subscription.update({
        where: { userId },
        data: {
          planId: plan.id,
          billingInterval,
          stripePriceId: priceId,
          status: mapSubscriptionStatus(updated.status),
          currentPeriodStart: currentPeriodStart(updated),
          currentPeriodEnd: currentPeriodEnd(updated),
        },
      });

      return { url: null };
    } catch (error) {
      this.logger.error(
        'Failed to change Stripe subscription plan',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not change plan, please try again',
      );
    }
  }

  async previewPlanChange(userId: string, dto: ChangePlanDto) {
    const subscription = await this.findOwnSubscriptionOrFail(userId);
    const plan = await this.findActivePlanOrFail(dto.planCode);
    const priceId =
      dto.interval === 'month'
        ? plan.stripeMonthlyPriceId
        : plan.stripeYearlyPriceId;

    if (!priceId || !subscription.stripeSubscriptionId) {
      throw new ConflictException(
        'A live paid subscription is required to preview this change',
      );
    }

    try {
      const current = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
      const item = current.items.data[0];
      if (!item) throw new ConflictException('Stripe subscription has no items');

      const preview = await this.stripe.invoices.createPreview({
        subscription: current.id,
        subscription_details: {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: 'always_invoice',
        },
      });

      return {
        amountDueCents: Math.max(0, preview.total),
        currency: preview.currency,
        isCredit: preview.total < 0,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error('Failed to preview Stripe plan change', error as Error);
      throw new ServiceUnavailableException(
        'Could not calculate the plan difference, please try again',
      );
    }
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
      this.logger.error('Failed to create Stripe billing portal', error as Error);
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
   * The invoice generated by a plan change, whether Stripe returned it expanded
   * or as a bare id.
   */
  private async resolveLatestInvoice(
    subscription: Stripe.Subscription,
  ): Promise<Stripe.Invoice | undefined> {
    const latest = subscription.latest_invoice;

    if (!latest) return undefined;
    if (typeof latest === 'string') {
      try {
        return await this.stripe.invoices.retrieve(latest);
      } catch (error) {
        this.logger.warn(
          `Could not retrieve latest invoice for subscription ${subscription.id}`,
          error as Error,
        );
        return undefined;
      }
    }

    return latest;
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
