import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import {
  currentPeriodEnd,
  currentPeriodStart,
  mapSubscriptionStatus,
  toBillingInterval,
} from './billing.service';
import { STRIPE_CLIENT } from './stripe.provider';

/**
 * Processes Stripe webhooks as the source of truth for subscription state.
 *
 * Every handler is idempotent: the event id is recorded in
 * `subscription_event` before any mutation, and the unique constraint rejects
 * duplicate deliveries.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  /**
   * Verifies the signature against the raw body, then dispatches the event.
   * Returns once the event is recorded as processed.
   */
  async handle(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ received: true }> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
      );
    } catch {
      this.logger.warn('Rejected webhook with invalid signature');
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.process(event);

    return { received: true };
  }

  /** Records the event (idempotency guard) then applies it. */
  private async process(event: Stripe.Event): Promise<void> {
    const alreadyProcessed = await this.prisma.subscriptionEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (alreadyProcessed) {
      this.logger.debug(`Skipping duplicate webhook event ${event.id}`);
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionEvent.create({
          data: {
            stripeEventId: event.id,
            type: event.type,
            payload: event as unknown as Prisma.InputJsonValue,
          },
        });

        await this.applyEvent(tx, event);
      });
    } catch (error) {
      // A concurrent duplicate delivery can still hit the unique constraint
      // after the pre-check above. The event was already applied by the other
      // request — treat it as handled rather than surface a 500 to Stripe.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicateEvent = await this.prisma.subscriptionEvent.findUnique({
          where: { stripeEventId: event.id },
          select: { id: true },
        });

        if (duplicateEvent) {
          this.logger.debug(
            `Suppressing concurrent duplicate webhook event ${event.id}`,
          );
          return;
        }
      }

      throw error;
    }
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutSessionCompleted(tx, event);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionChanged(tx, event);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(tx, event);
        break;
      case 'invoice.payment_succeeded':
        await this.onPaymentSucceeded(tx, event);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(tx, event);
        break;
      default:
        this.logger.debug(`Ignoring unhandled webhook event ${event.type}`);
    }
  }

  /** Checkout completion: attach the real subscription id to our row. */
  private async onCheckoutSessionCompleted(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id ?? session.metadata?.userId;

    if (!userId || !session.subscription) {
      this.logger.warn(
        `checkout.session.completed missing userId/session.subscription: ${session.id}`,
      );
      return;
    }

    let stripeSubscription: Stripe.Subscription;
    try {
      stripeSubscription = await this.stripe.subscriptions.retrieve(
        session.subscription as string,
      );
    } catch (error) {
      // session.subscription can briefly be a draft that Stripe asynchronously
      // finalizes; a transient failure now is retried by Stripe later.
      this.logger.warn(
        `Could not retrieve Stripe subscription for session ${session.id}; will retry`,
        error as Error,
      );
      throw error;
    }

    const planId = await this.resolvePlanIdForPrice(
      tx,
      stripeSubscription.items?.data?.[0]?.price?.id,
    );
    const stripePriceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const interval = this.intervalFromPrice(
      stripeSubscription.items?.data?.[0]?.price,
    );

    await tx.subscription.upsert({
      where: { userId },
      create: this.subscriptionSeed(
        userId,
        stripeSubscription,
        session,
        planId,
        stripePriceId,
        interval,
      ),
      update: {
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: (session.customer as string | null) ?? undefined,
        planId: planId ?? undefined,
        stripePriceId: stripePriceId ?? undefined,
        billingInterval: interval,
        status: mapSubscriptionStatus(stripeSubscription.status),
        currentPeriodStart: currentPeriodStart(stripeSubscription),
        currentPeriodEnd: currentPeriodEnd(stripeSubscription),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        canceledAt: null,
      },
    });
  }

  private subscriptionSeed(
    userId: string,
    sub: Stripe.Subscription,
    session: Stripe.Checkout.Session,
    planId: string | null,
    stripePriceId: string | null | undefined,
    interval: BillingInterval | undefined,
  ): Prisma.SubscriptionUncheckedCreateInput {
    return {
      userId,
      planId: planId ?? undefined,
      stripeCustomerId: (session.customer as string | null) ?? undefined,
      stripeSubscriptionId: (session.subscription as string) ?? undefined,
      stripePriceId: stripePriceId ?? undefined,
      billingInterval: interval,
      status: mapSubscriptionStatus(sub.status),
      currentPeriodStart: currentPeriodStart(sub),
      currentPeriodEnd: currentPeriodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  }

  /** Keeps the local subscription in sync with Stripe (upgrade/downgrade, etc). */
  private async onSubscriptionChanged(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const sub = event.data.object as Stripe.Subscription;
    const userId = await this.resolveUserIdForSubscription(tx, sub);
    if (!userId) return;

    const price = sub.items?.data?.[0]?.price;
    const planId = await this.resolvePlanIdForPrice(tx, price?.id);
    const interval = this.intervalFromPrice(price);

    await tx.subscription.upsert({
      where: { userId },
      create: {
        userId,
        planId: planId ?? undefined,
        stripeCustomerId: customerId(sub),
        stripeSubscriptionId: sub.id,
        stripePriceId: price?.id,
        billingInterval: interval,
        status: mapSubscriptionStatus(sub.status),
        currentPeriodStart: currentPeriodStart(sub),
        currentPeriodEnd: currentPeriodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
      update: {
        planId: planId ?? undefined,
        stripeCustomerId: customerId(sub),
        stripeSubscriptionId: sub.id,
        stripePriceId: price?.id,
        billingInterval: interval,
        status: mapSubscriptionStatus(sub.status),
        currentPeriodStart: currentPeriodStart(sub),
        currentPeriodEnd: currentPeriodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });
  }

  /** Immediate cancellation is recorded when Stripe confirms the deletion. */
  private async onSubscriptionDeleted(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const sub = event.data.object as Stripe.Subscription;
    const userId = await this.resolveUserIdForSubscription(tx, sub);
    if (!userId) return;

    await tx.subscription.updateMany({
      where: { userId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
      },
    });
  }

  /** Successful renewal keeps the subscription active and refreshes the period. */
  private async onPaymentSucceeded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const userId = await this.resolveUserIdForCustomer(tx, customerId(invoice));

    if (!userId) return;

    const stripeSubscriptionId = await this.findStripeSubscriptionIdOrFail(
      tx,
      userId,
    );

    if (!stripeSubscriptionId) return;

    // A subscription deleted in the same instant can 404 here; the
    // localStorage row is corrected by the deleted event, so a transient
    // failure to refresh it must not roll back the whole webhook.
    let subscription: Stripe.Subscription;
    try {
      subscription =
        await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (error) {
      this.logger.warn(
        `Could not refresh subscription ${stripeSubscriptionId} for user ${userId}`,
        error as Error,
      );
      return;
    }

    const price = subscription.items?.data?.[0]?.price;
    const planId = await this.resolvePlanIdForPrice(tx, price?.id);

    await tx.subscription.update({
      where: { userId },
      data: {
        planId: planId ?? undefined,
        stripeSubscriptionId: subscription.id,
        stripePriceId: price?.id,
        billingInterval: this.intervalFromPrice(price),
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodStart: currentPeriodStart(subscription),
        currentPeriodEnd: currentPeriodEnd(subscription),
      },
    });
  }

  /**
   * A failed renewal payment cancels the subscription. Per the product policy
   * a single failure ends access rather than leaving it in limbo.
   */
  private async onPaymentFailed(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.billing_reason !== 'subscription_cycle') {
      this.logger.debug(`Ignoring non-renewal failed invoice ${invoice.id}`);
      return;
    }

    const failedSubscriptionId = invoiceSubscriptionId(invoice);
    if (!failedSubscriptionId) {
      this.logger.warn(
        `Renewal invoice ${invoice.id} has no Stripe subscription id`,
      );
      return;
    }

    const userId = await this.resolveUserIdForCustomer(tx, customerId(invoice));

    if (!userId) return;

    const stripeSubscriptionId = await this.findStripeSubscriptionIdOrFail(
      tx,
      userId,
    );

    if (!stripeSubscriptionId) {
      this.logger.warn(
        `invoice.payment_failed has no local subscription for user ${userId}`,
      );
      return;
    }

    if (stripeSubscriptionId !== failedSubscriptionId) {
      this.logger.warn(
        `Ignoring failed invoice ${invoice.id} for stale subscription ${failedSubscriptionId}`,
      );
      return;
    }

    try {
      await this.stripe.subscriptions.cancel(stripeSubscriptionId);
    } catch (error) {
      this.logger.warn(
        `Could not cancel Stripe subscription ${stripeSubscriptionId} after failed payment`,
        error as Error,
      );
    }

    await tx.subscription.updateMany({
      where: { userId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
      },
    });
  }

  private async resolveUserIdForSubscription(
    tx: Prisma.TransactionClient,
    sub: Stripe.Subscription,
  ): Promise<string | null> {
    const metadataUserId = sub.metadata?.userId;

    if (metadataUserId) {
      const user = await tx.user.findUnique({
        where: { id: metadataUserId },
        select: { id: true },
      });
      if (user) return user.id;
    }

    const local = await tx.subscription.findFirst({
      where: {
        OR: [
          { stripeSubscriptionId: sub.id },
          { stripeCustomerId: customerId(sub) },
        ],
      },
      select: { userId: true },
    });

    return local?.userId ?? null;
  }

  private async resolveUserIdForCustomer(
    tx: Prisma.TransactionClient,
    stripeCustomerId: string | null,
  ): Promise<string | null> {
    if (!stripeCustomerId) return null;

    const local = await tx.subscription.findUnique({
      where: { stripeCustomerId },
      select: { userId: true },
    });

    return local?.userId ?? null;
  }

  private async findStripeSubscriptionIdOrFail(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<string | null> {
    const local = await tx.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true },
    });

    return local?.stripeSubscriptionId ?? null;
  }

  private async resolvePlanIdForPrice(
    tx: Prisma.TransactionClient,
    priceId?: string | null,
  ): Promise<string | null> {
    if (!priceId) return null;

    const plan = await tx.plan.findFirst({
      where: {
        OR: [
          { stripeMonthlyPriceId: priceId },
          { stripeYearlyPriceId: priceId },
        ],
      },
      select: { id: true },
    });

    return plan?.id ?? null;
  }

  private intervalFromPrice(
    price: Stripe.Price | undefined,
  ): BillingInterval | undefined {
    if (price?.recurring?.interval === 'year') return toBillingInterval('year');
    if (price?.recurring?.interval === 'month') {
      return toBillingInterval('month');
    }
    return undefined;
  }
}

/** Stripe v22 types invoice/subscription `customer` as customer | Customer. */
function customerId(obj: Stripe.Subscription | Stripe.Invoice): string | null {
  return typeof obj.customer === 'string'
    ? obj.customer
    : (obj.customer?.id ?? null);
}

/** Resolves both the current and legacy Stripe invoice subscription shapes. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  if (typeof current === 'string') return current;
  if (current?.id) return current.id;

  const legacy = (
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }
  ).subscription;

  if (typeof legacy === 'string') return legacy;
  return legacy?.id ?? null;
}

type BillingInterval = import('@prisma/client').BillingInterval;
