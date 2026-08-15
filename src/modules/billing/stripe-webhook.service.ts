import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { PlanChangeKind, Prisma, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

import { PrismaService } from '../../prisma/prisma.service';
import { GenerationCreditsService } from '../generation-credits/generation-credits.service';
import {
  currentPeriodEnd,
  currentPeriodStart,
  mapSubscriptionStatus,
  toBillingInterval,
} from './billing.service';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { STRIPE_CLIENT } from './stripe.provider';

/** Columns describing a queued plan change, cleared together once it lands. */
const CLEAR_PENDING_CHANGE = {
  pendingPlanId: null,
  pendingInterval: null,
  pendingEffectiveAt: null,
  stripeScheduleId: null,
} as const;

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
    private readonly generationCredits: GenerationCreditsService,
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

  /**
   * Reconciles the Checkout the authenticated browser just returned from.
   * This is a fallback for delayed/missing local webhook forwarding: Stripe's
   * session, payment, customer, user and target plan are all verified before
   * the same idempotent handler used by the webhook is applied.
   */
  async confirmCheckoutReturn(
    userId: string,
    dto: ConfirmCheckoutDto,
  ): Promise<{ confirmed: boolean }> {
    const local = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        planId: true,
        billingInterval: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        checkoutSessionId: true,
      },
    });

    if (!local) return { confirmed: false };

    const expectedPlan = dto.planCode
      ? await this.prisma.plan.findFirst({
          where: { code: dto.planCode, active: true },
          select: { id: true },
        })
      : null;

    if (dto.planCode && !expectedPlan) {
      throw new BadRequestException('The completed Checkout plan is invalid');
    }

    let session: Stripe.Checkout.Session | undefined;
    if (dto.sessionId) {
      session = await this.retrieveCheckoutSession(dto.sessionId);
    } else {
      session = await this.findRecentPaidPlanChangeSession(
        userId,
        local,
        expectedPlan?.id,
      );
    }

    if (!session || session.status !== 'complete') {
      return { confirmed: false };
    }

    const sessionUserId =
      session.client_reference_id ?? session.metadata?.userId;
    const sessionCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    if (
      sessionUserId !== userId ||
      (local.stripeCustomerId && sessionCustomerId !== local.stripeCustomerId)
    ) {
      throw new ForbiddenException(
        'This Checkout session does not belong to the signed-in account',
      );
    }

    if (session.metadata?.billingFlow === 'plan_change') {
      if (
        (expectedPlan && session.metadata?.planId !== expectedPlan.id) ||
        (dto.interval && session.metadata?.interval !== dto.interval)
      ) {
        throw new ForbiddenException(
          'The completed Checkout does not match the requested plan',
        );
      }
    } else if (
      (expectedPlan && local.planId !== expectedPlan.id) ||
      (dto.interval &&
        local.billingInterval !== toBillingInterval(dto.interval))
    ) {
      throw new ForbiddenException(
        'The completed Checkout does not match the requested subscription',
      );
    }

    await this.prisma.$transaction((tx) =>
      this.applyCompletedCheckoutSession(tx, session),
    );
    return { confirmed: true };
  }

  private async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<Stripe.Checkout.Session> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      this.logger.warn(
        `Could not verify Checkout Session ${sessionId}`,
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not verify the completed payment with Stripe',
      );
    }
  }

  /**
   * Repairs a just-paid upgrade created before the success URL carried a
   * session id. Only a recent consumed quote whose Stripe source Price still
   * matches the local subscription is eligible.
   */
  private async findRecentPaidPlanChangeSession(
    userId: string,
    local: {
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      stripePriceId: string | null;
    },
    expectedPlanId?: string,
  ): Promise<Stripe.Checkout.Session | undefined> {
    if (!local.stripeCustomerId || !local.stripeSubscriptionId)
      return undefined;

    const quote = await this.prisma.planChangeQuote.findFirst({
      where: {
        userId,
        kind: PlanChangeKind.UPGRADE,
        consumedAt: { not: null },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        ...(expectedPlanId ? { planId: expectedPlanId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        planId: true,
        fromPriceId: true,
        targetPriceId: true,
      },
    });

    if (
      !quote ||
      quote.targetPriceId === local.stripePriceId ||
      quote.fromPriceId !== local.stripePriceId
    ) {
      return undefined;
    }

    let sessions: Stripe.ApiList<Stripe.Checkout.Session>;
    try {
      sessions = await this.stripe.checkout.sessions.list({
        customer: local.stripeCustomerId,
        limit: 20,
      });
    } catch (error) {
      this.logger.warn(
        `Could not inspect recent Checkout Sessions for user ${userId}`,
        error as Error,
      );
      throw new ServiceUnavailableException(
        'Could not verify the completed payment with Stripe',
      );
    }

    return sessions.data.find(
      (candidate) =>
        candidate.status === 'complete' &&
        candidate.payment_status === 'paid' &&
        candidate.metadata?.billingFlow === 'plan_change' &&
        candidate.metadata?.userId === userId &&
        candidate.metadata?.quoteId === quote.id &&
        candidate.metadata?.planId === quote.planId &&
        candidate.metadata?.sourcePriceId === quote.fromPriceId &&
        candidate.metadata?.targetPriceId === quote.targetPriceId &&
        candidate.metadata?.stripeSubscriptionId === local.stripeSubscriptionId,
    );
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
        const record = await tx.subscriptionEvent.create({
          data: {
            stripeEventId: event.id,
            type: event.type,
            payload: event,
          },
        });

        await this.applyEvent(tx, event);

        // Link the audit row afterwards: an event that creates the subscription
        // has nothing to point at until its handler has run.
        const subscriptionId = await this.resolveLocalSubscriptionId(tx, event);
        if (subscriptionId) {
          await tx.subscriptionEvent.update({
            where: { id: record.id },
            data: { subscriptionId },
          });
        }
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
      // Pause/resume carry the same subscription payload as create/update; the
      // status mapping already turns them into PAUSED/ACTIVE, which is what
      // gates access.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await this.onSubscriptionChanged(tx, event);
        break;
      case 'subscription_schedule.released':
      case 'subscription_schedule.canceled':
        await this.onScheduleEnded(tx, event);
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

    await this.applyCompletedCheckoutSession(tx, session);
  }

  private async applyCompletedCheckoutSession(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.metadata?.billingFlow === 'plan_change') {
      await this.onPaidPlanChangeCheckout(tx, session);
      return;
    }

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

  /**
   * A paid plan-change Checkout is a one-time payment. Once Stripe confirms it,
   * apply the trusted target Price with proration disabled so the customer is
   * not charged a second time. The Checkout card becomes the subscription's
   * default method for later renewals.
   */
  private async onPaidPlanChangeCheckout(
    tx: Prisma.TransactionClient,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.client_reference_id ?? session.metadata?.userId;
    const stripeSubscriptionId = session.metadata?.stripeSubscriptionId;
    const sourcePriceId = session.metadata?.sourcePriceId;
    const targetPriceId = session.metadata?.targetPriceId;
    const expectedPlanId = session.metadata?.planId;

    if (
      !userId ||
      !stripeSubscriptionId ||
      !sourcePriceId ||
      !targetPriceId ||
      session.payment_status !== 'paid'
    ) {
      throw new Error(
        `Paid plan-change Checkout ${session.id} is missing trusted payment metadata`,
      );
    }

    const local = await tx.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });
    const sessionCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer?.id ?? null);

    if (
      !local ||
      local.stripeSubscriptionId !== stripeSubscriptionId ||
      (local.stripeCustomerId && sessionCustomerId !== local.stripeCustomerId)
    ) {
      throw new Error(
        `Paid plan-change Checkout ${session.id} does not match the user's subscription`,
      );
    }

    const planId = await this.resolvePlanIdForPrice(tx, targetPriceId);
    if (!planId || (expectedPlanId && expectedPlanId !== planId)) {
      throw new Error(
        `Paid plan-change Checkout ${session.id} has an unknown target Price`,
      );
    }

    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? await this.stripe.paymentIntents.retrieve(session.payment_intent)
        : session.payment_intent;
    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      throw new Error(
        `Paid plan-change Checkout ${session.id} has no successful PaymentIntent`,
      );
    }

    const paymentMethodId =
      typeof paymentIntent.payment_method === 'string'
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id;
    const current =
      await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
    const item = current.items.data[0];
    if (!item) {
      throw new Error(
        `Stripe subscription ${stripeSubscriptionId} has no subscription item`,
      );
    }

    let updated = current;
    if (item.price.id !== targetPriceId) {
      if (item.price.id !== sourcePriceId) {
        throw new Error(
          `Stripe subscription ${stripeSubscriptionId} changed before Checkout ${session.id} completed`,
        );
      }

      updated = await this.stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          items: [{ id: item.id, price: targetPriceId }],
          proration_behavior: 'none',
          default_payment_method: paymentMethodId,
        },
        { idempotencyKey: `apply-plan-change:${session.id}` },
      );
    }

    const updatedPrice = updated.items.data[0]?.price;
    const metadataInterval =
      session.metadata?.interval === 'year'
        ? toBillingInterval('year')
        : toBillingInterval('month');

    await tx.subscription.update({
      where: { userId },
      data: {
        planId,
        stripePriceId: targetPriceId,
        billingInterval:
          this.intervalFromPrice(updatedPrice) ?? metadataInterval,
        status: mapSubscriptionStatus(updated.status),
        currentPeriodStart: currentPeriodStart(updated),
        currentPeriodEnd: currentPeriodEnd(updated),
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        canceledAt: null,
        // A plan the customer has just paid for replaces anything they had
        // queued for the period end.
        ...CLEAR_PENDING_CHANGE,
      },
    });

    // Raise the allowance to the new plan's ceiling in the same transaction, so
    // the credits the customer just paid for are available the moment the plan
    // is. This only ever moves `generationCreditLimit`, so a duplicate delivery
    // recomputes the same value rather than granting a second allowance.
    await this.generationCredits.getUsageInTransaction(tx, userId);

    if (session.metadata?.quoteId) {
      await tx.planChangeQuote.updateMany({
        where: { id: session.metadata.quoteId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    }
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

    const existing = await tx.subscription.findUnique({
      where: { userId },
      select: { planId: true, pendingPlanId: true },
    });
    // A scheduled downgrade landing, or a change made straight in Stripe's
    // portal, both arrive here as a plain price change.
    const planChanged = Boolean(planId) && existing?.planId !== planId;
    const pendingSettled =
      existing?.pendingPlanId != null && existing.pendingPlanId === planId;

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
        ...(pendingSettled ? CLEAR_PENDING_CHANGE : {}),
      },
    });

    // Resync the allowance whenever the plan behind it moved, so a downgrade
    // that lands at the period end drops the ceiling and an upgrade made
    // outside our own flow still grants what was paid for.
    if (planChanged) {
      await this.generationCredits.getUsageInTransaction(tx, userId);
    }
  }

  /**
   * A released or cancelled schedule no longer governs the subscription, so any
   * queued change we were still advertising is gone. The phase transition that
   * released it arrives separately as `customer.subscription.updated`.
   */
  private async onScheduleEnded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const schedule = event.data.object as Stripe.SubscriptionSchedule;

    await tx.subscription.updateMany({
      where: { stripeScheduleId: schedule.id },
      data: CLEAR_PENDING_CHANGE,
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

  /**
   * Finds the local subscription an event belongs to, so the audit trail can be
   * read per customer instead of only as a flat log.
   */
  private async resolveLocalSubscriptionId(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<string | null> {
    const object = event.data.object as {
      id?: string;
      customer?: string | { id: string } | null;
      subscription?: string | { id: string } | null;
    };

    const stripeCustomerId =
      typeof object.customer === 'string'
        ? object.customer
        : (object.customer?.id ?? null);

    let stripeSubscriptionId =
      typeof object.subscription === 'string'
        ? object.subscription
        : (object.subscription?.id ?? null);

    if (
      !stripeSubscriptionId &&
      event.type.startsWith('customer.subscription.')
    ) {
      stripeSubscriptionId = object.id ?? null;
    }

    // Without either identifier there is nothing to match on, and an empty OR
    // would match the first subscription in the table.
    if (!stripeSubscriptionId && !stripeCustomerId) return null;

    const local = await tx.subscription.findFirst({
      where: {
        OR: [
          ...(stripeSubscriptionId ? [{ stripeSubscriptionId }] : []),
          ...(stripeCustomerId ? [{ stripeCustomerId }] : []),
        ],
      },
      select: { id: true },
    });

    return local?.id ?? null;
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
