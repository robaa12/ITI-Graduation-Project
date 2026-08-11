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
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  /** Active plans in display order. Price metadata kept internal. */
  listPlans() {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        name: true,
        description: true,
        sortOrder: true,
      },
    });
  }

  /** The authenticated user's subscription with its plan, or null. */
  getSubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
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
  ): Promise<{ url: string }> {
    const plan = await this.findActivePlanOrFail(dto.planCode);
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
      select: { status: true, stripeSubscriptionId: true },
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

    const stripeCustomerId = await this.findOrCreateCustomer(userId, user);

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url:
          this.configService.getOrThrow<string>('STRIPE_SUCCESS_URL'),
        cancel_url: this.configService.getOrThrow<string>('STRIPE_CANCEL_URL'),
        client_reference_id: userId,
        metadata: { userId },
        subscription_data: {
          metadata: { userId, planCode: dto.planCode, interval: dto.interval },
        },
      });
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
          billingInterval: toBillingInterval(dto.interval),
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
          billingInterval: toBillingInterval(dto.interval),
          stripeCustomerId,
          checkoutSessionId: session.id,
          status: SubscriptionStatus.INCOMPLETE,
        },
      });
    }

    return { url: session.url };
  }

  /**
   * Changes the current plan with Stripe's default proration behavior.
   * Only the new plan's trusted Prices are accepted — never arbitrary ids.
   */
  async changePlan(userId: string, dto: ChangePlanDto) {
    const subscription = await this.findOwnSubscriptionOrFail(userId);
    const plan = await this.findActivePlanOrFail(dto.planCode);
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
      throw new ConflictException('Subscription is not active');
    }

    const current = await this.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const item = current.items.data[0];

    if (!item) {
      throw new ConflictException('Stripe subscription has no items');
    }

    try {
      const updated = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: [{ id: item.id, price: priceId }],
          // Stripe's default proration behavior; explicit for clarity.
          proration_behavior: 'create_prorations',
        },
      );

      await this.prisma.subscription.update({
        where: { userId },
        data: {
          planId: plan.id,
          billingInterval: toBillingInterval(dto.interval),
          stripePriceId: priceId,
          status: mapSubscriptionStatus(updated.status),
          currentPeriodStart: currentPeriodStart(updated),
          currentPeriodEnd: currentPeriodEnd(updated),
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to change Stripe subscription plan',
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not change plan, please try again',
      );
    }

    return this.getSubscription(userId);
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
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId },
      });

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
}
