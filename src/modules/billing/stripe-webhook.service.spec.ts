import { BadRequestException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';

import { StripeWebhookService } from './stripe-webhook.service';

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;
  let tx: {
    plan: { findFirst: jest.Mock };
    subscription: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    subscriptionEvent: { create: jest.Mock; update: jest.Mock };
    planChangeQuote: { updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    subscriptionEvent: { findUnique: jest.Mock };
    subscription: { findUnique: jest.Mock };
    plan: { findFirst: jest.Mock };
    planChangeQuote: { findFirst: jest.Mock };
  };
  let stripe: {
    checkout: {
      sessions: { retrieve: jest.Mock; list: jest.Mock };
    };
    paymentIntents: { retrieve: jest.Mock };
    subscriptions: {
      cancel: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
    };
    webhooks: { constructEvent: jest.Mock };
  };
  let config: { getOrThrow: jest.Mock };
  let generationCredits: { getUsageInTransaction: jest.Mock };

  const makeEvent = (type: string, id = 'evt_1'): Stripe.Event => ({
    id,
    type,
    data: { object: {} },
  });

  const rawBody = Buffer.from('{"payload":"raw"}', 'utf8');

  beforeEach(() => {
    tx = {
      plan: { findFirst: jest.fn() },
      subscription: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      subscriptionEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-row-1' }),
        update: jest.fn(),
      },
      planChangeQuote: { updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn((run) => run(tx)),
      subscriptionEvent: { findUnique: jest.fn() },
      subscription: { findUnique: jest.fn() },
      plan: { findFirst: jest.fn() },
      planChangeQuote: { findFirst: jest.fn() },
    };

    stripe = {
      checkout: {
        sessions: { retrieve: jest.fn(), list: jest.fn() },
      },
      paymentIntents: { retrieve: jest.fn() },
      subscriptions: {
        cancel: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    config = { getOrThrow: jest.fn().mockReturnValue('whsec_test') };
    generationCredits = { getUsageInTransaction: jest.fn() };

    service = new StripeWebhookService(
      // @ts-expect-error test double with only the members under test
      prisma,
      config,
      generationCredits,
      stripe,
    );
  });

  describe('signature verification', () => {
    it('rejects a request with an invalid Stripe signature', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(service.handle(rawBody, 'wrong')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.subscriptionEvent.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('processes an event with a valid signature', async () => {
      const event = makeEvent('checkout.session.completed');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.upsert.mockResolvedValue({});

      await expect(service.handle(rawBody, 'valid-signature')).resolves.toEqual(
        {
          received: true,
        },
      );
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        'valid-signature',
        'whsec_test',
      );
    });
  });

  describe('idempotency', () => {
    it('ignores a duplicate webhook event by id', async () => {
      const event = makeEvent('customer.subscription.updated', 'evt_dup');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue({
        stripeEventId: 'evt_dup',
      });

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.subscription.upsert).not.toHaveBeenCalled();
    });

    it('swallows a concurrent duplicate that hits the unique constraint', async () => {
      const event = makeEvent('customer.subscription.updated');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'local-event-id' });
      tx.subscriptionEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate key', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      // The concurrent duplicate never re-applies the event's effects.
      expect(tx.subscription.upsert).not.toHaveBeenCalled();
    });

    it('rethrows a unique violation that was not caused by the event id', async () => {
      const event = makeEvent('customer.subscription.updated');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscriptionEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate customer id', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.handle(rawBody, 'sig')).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('rethrows non-unique errors from the transaction', async () => {
      const event = makeEvent('customer.subscription.updated');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscriptionEvent.create.mockRejectedValue(
        new Error('database is down'),
      );

      await expect(service.handle(rawBody, 'sig')).rejects.toThrow(
        'database is down',
      );
    });
  });

  describe('checkout.session.completed', () => {
    it('attaches the real Stripe subscription to the user row', async () => {
      const event = makeEvent('checkout.session.completed');
      event.data.object = {
        id: 'cs_123',
        client_reference_id: 'user-1',
        customer: 'cus_123',
        subscription: 'sub_123',
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [
            {
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_000_000 + 2_592_000,
              price: { id: 'price_monthly' },
            },
          ],
        },
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-1' });
      tx.subscription.upsert.mockResolvedValue({});

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
      expect(tx.subscription.upsert).toHaveBeenCalled();
      const arg = tx.subscription.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'user-1' });
      expect(arg.update).toMatchObject({
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
        planId: 'plan-1',
        status: SubscriptionStatus.ACTIVE,
      });
    });

    it('applies a paid plan change only after Checkout completes', async () => {
      const event = makeEvent('checkout.session.completed');
      event.data.object = {
        id: 'cs_upgrade',
        client_reference_id: 'user-1',
        customer: 'cus_123',
        payment_intent: 'pi_upgrade',
        payment_status: 'paid',
        metadata: {
          billingFlow: 'plan_change',
          userId: 'user-1',
          planId: 'plan-business',
          interval: 'month',
          stripeSubscriptionId: 'sub_123',
          sourcePriceId: 'price_pro_monthly',
          targetPriceId: 'price_business_monthly',
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_upgrade',
        status: 'succeeded',
        payment_method: 'pm_new_card',
      });
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              id: 'si_123',
              price: {
                id: 'price_pro_monthly',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      });
      stripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              id: 'si_123',
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_592_000,
              price: {
                id: 'price_business_monthly',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      });
      tx.subscription.update.mockResolvedValue({});

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        {
          items: [{ id: 'si_123', price: 'price_business_monthly' }],
          proration_behavior: 'none',
          default_payment_method: 'pm_new_card',
        },
        { idempotencyKey: 'apply-plan-change:cs_upgrade' },
      );
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          planId: 'plan-business',
          stripePriceId: 'price_business_monthly',
          billingInterval: 'MONTHLY',
          status: SubscriptionStatus.ACTIVE,
          // Anything queued for the period end is superseded by a paid upgrade.
          pendingPlanId: null,
          stripeScheduleId: null,
        }),
      });
      // The credits the customer just paid for are granted in the same
      // transaction that applies the plan.
      expect(generationCredits.getUsageInTransaction).toHaveBeenCalledWith(
        tx,
        'user-1',
      );
    });

    it('grants the new allowance only after the plan row is updated', async () => {
      const event = makeEvent('checkout.session.completed');
      event.data.object = paidPlanChangeSession();
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_upgrade',
        status: 'succeeded',
        payment_method: 'pm_new_card',
      });
      stripe.subscriptions.retrieve.mockResolvedValue(
        liveSubscription('price_pro_monthly'),
      );
      stripe.subscriptions.update.mockResolvedValue(
        liveSubscription('price_business_monthly'),
      );

      const order: string[] = [];
      tx.subscription.update.mockImplementation(() => {
        order.push('plan');
        return Promise.resolve({});
      });
      generationCredits.getUsageInTransaction.mockImplementation(() => {
        order.push('credits');
        return Promise.resolve({});
      });

      await service.handle(rawBody, 'sig');

      // Order matters: the allowance is derived from the subscription's plan,
      // so syncing first would recompute against the plan being replaced.
      expect(order).toEqual(['plan', 'credits']);
    });

    it('does not grant credits when the subscription moved under the Checkout', async () => {
      const event = makeEvent('checkout.session.completed');
      event.data.object = paidPlanChangeSession();
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_upgrade',
        status: 'succeeded',
        payment_method: 'pm_new_card',
      });
      // Somebody changed the price between quoting and paying.
      stripe.subscriptions.retrieve.mockResolvedValue(
        liveSubscription('price_something_else'),
      );

      await expect(service.handle(rawBody, 'sig')).rejects.toThrow();
      expect(generationCredits.getUsageInTransaction).not.toHaveBeenCalled();
      expect(tx.subscription.update).not.toHaveBeenCalled();
    });

    it('applies a completed authenticated Checkout return when the webhook is delayed', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-pro',
        billingInterval: 'MONTHLY',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
        checkoutSessionId: null,
      });
      prisma.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.checkout.sessions.retrieve.mockResolvedValue(
        paidPlanChangeSession(),
      );
      tx.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_upgrade',
        status: 'succeeded',
        payment_method: 'pm_new_card',
      });
      stripe.subscriptions.retrieve.mockResolvedValue(
        liveSubscription('price_pro_monthly'),
      );
      stripe.subscriptions.update.mockResolvedValue(
        liveSubscription('price_business_monthly'),
      );

      await expect(
        service.confirmCheckoutReturn('user-1', {
          sessionId: 'cs_upgrade',
          planCode: 'business',
          interval: 'month',
        }),
      ).resolves.toEqual({ confirmed: true });

      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
        'cs_upgrade',
      );
      expect(tx.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            planId: 'plan-business',
            stripePriceId: 'price_business_monthly',
          }),
        }),
      );
    });

    it('repairs a recent paid upgrade created before the return URL carried a session id', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-pro',
        billingInterval: 'MONTHLY',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
        checkoutSessionId: null,
      });
      prisma.planChangeQuote.findFirst.mockResolvedValue({
        id: 'quote-1',
        planId: 'plan-business',
        fromPriceId: 'price_pro_monthly',
        targetPriceId: 'price_business_monthly',
      });
      stripe.checkout.sessions.list.mockResolvedValue({
        data: [
          {
            ...paidPlanChangeSession(),
            metadata: {
              ...paidPlanChangeSession().metadata,
              quoteId: 'quote-1',
            },
          },
        ],
      });
      tx.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-business' });
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_upgrade',
        status: 'succeeded',
        payment_method: 'pm_new_card',
      });
      stripe.subscriptions.retrieve.mockResolvedValue(
        liveSubscription('price_pro_monthly'),
      );
      stripe.subscriptions.update.mockResolvedValue(
        liveSubscription('price_business_monthly'),
      );

      await expect(
        service.confirmCheckoutReturn('user-1', {}),
      ).resolves.toEqual({ confirmed: true });

      expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        limit: 20,
      });
      expect(tx.subscription.update).toHaveBeenCalled();
    });

    function paidPlanChangeSession() {
      return {
        id: 'cs_upgrade',
        status: 'complete',
        client_reference_id: 'user-1',
        customer: 'cus_123',
        payment_intent: 'pi_upgrade',
        payment_status: 'paid',
        metadata: {
          billingFlow: 'plan_change',
          userId: 'user-1',
          planId: 'plan-business',
          interval: 'month',
          stripeSubscriptionId: 'sub_123',
          sourcePriceId: 'price_pro_monthly',
          targetPriceId: 'price_business_monthly',
        },
      };
    }

    function liveSubscription(priceId: string) {
      return {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              id: 'si_123',
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_592_000,
              price: { id: priceId, recurring: { interval: 'month' } },
            },
          ],
        },
      };
    }
  });

  describe('customer.subscription.updated', () => {
    it('synchronizes plan and interval changes from Stripe', async () => {
      const event = makeEvent('customer.subscription.updated');
      event.data.object = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId: 'user-1' },
        items: {
          data: [
            {
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_000_000 + 2_592_000,
              price: {
                id: 'price_pro_monthly',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-2' });
      tx.subscription.upsert.mockResolvedValue({});

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      const arg = tx.subscription.upsert.mock.calls[0][0];
      expect(arg.update).toMatchObject({
        planId: 'plan-2',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_pro_monthly',
        status: SubscriptionStatus.ACTIVE,
      });
    });
  });

  describe('customer.subscription.deleted', () => {
    it('records the cancellation when Stripe confirms deletion', async () => {
      const event = makeEvent('customer.subscription.deleted');
      event.data.object = {
        id: 'sub_123',
        customer: 'cus_123',
        metadata: { userId: 'user-1' },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.subscription.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(tx.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
        }),
      });
    });
  });

  describe('invoice.payment_succeeded', () => {
    it('refreshes the active status after a successful renewal', async () => {
      const event = makeEvent('invoice.payment_succeeded');
      event.data.object = { id: 'in_123', customer: 'cus_123' };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique
        .mockResolvedValueOnce({ userId: 'user-1' }) // resolveUserIdForCustomer
        .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_123' }); // stripe id
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [
            {
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_000_000 + 2_592_000,
              price: {
                id: 'price_pro_monthly',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-2' });
      tx.subscription.update.mockResolvedValue({});

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          planId: 'plan-2',
          stripeSubscriptionId: 'sub_123',
          stripePriceId: 'price_pro_monthly',
          billingInterval: expect.any(String),
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
        }),
      });
    });
  });

  describe('invoice.payment_failed', () => {
    it('cancels the Stripe subscription and removes access on the first failure', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = {
        id: 'in_123',
        customer: 'cus_123',
        billing_reason: 'subscription_cycle',
        parent: {
          subscription_details: { subscription: 'sub_123' },
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique
        .mockResolvedValueOnce({ userId: 'user-1' }) // resolveUserIdForCustomer
        .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_123' }); // stripe id
      tx.subscription.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_123');
      expect(tx.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: false,
          canceledAt: expect.any(Date),
        }),
      });
    });

    it('survives a failed Stripe cancel call but still removes local access', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = {
        id: 'in_123',
        customer: 'cus_123',
        billing_reason: 'subscription_cycle',
        parent: {
          subscription_details: { subscription: 'sub_123' },
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique
        .mockResolvedValueOnce({ userId: 'user-1' })
        .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_123' });
      stripe.subscriptions.cancel.mockRejectedValue(
        new Error('stripe unreachable'),
      );
      tx.subscription.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(tx.subscription.updateMany).toHaveBeenCalled();
    });

    it('does nothing when no local subscription references the customer', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = {
        id: 'in_123',
        customer: 'cus_unknown',
        billing_reason: 'subscription_cycle',
        parent: {
          subscription_details: { subscription: 'sub_123' },
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique.mockResolvedValue(null);

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(tx.subscription.updateMany).not.toHaveBeenCalled();
    });

    it('does not cancel for a failed plan-change invoice', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = {
        id: 'in_upgrade',
        customer: 'cus_123',
        billing_reason: 'subscription_update',
        parent: {
          subscription_details: { subscription: 'sub_123' },
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(tx.subscription.findUnique).not.toHaveBeenCalled();
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('does not cancel when the failed renewal belongs to a stale subscription', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = {
        id: 'in_old',
        customer: 'cus_123',
        billing_reason: 'subscription_cycle',
        parent: {
          subscription_details: { subscription: 'sub_old' },
        },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique
        .mockResolvedValueOnce({ userId: 'user-1' })
        .mockResolvedValueOnce({ stripeSubscriptionId: 'sub_current' });

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(tx.subscription.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('scheduled downgrades landing', () => {
    const phaseTransition = () => {
      const event = makeEvent('customer.subscription.updated');
      event.data.object = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId: 'user-1' },
        items: {
          data: [
            {
              current_period_start: 1_702_592_000,
              current_period_end: 1_705_270_400,
              price: {
                id: 'price_lite_monthly',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      };
      return event;
    };

    it('drops the allowance and clears the pending change when the phase flips', async () => {
      const event = phaseTransition();
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-lite' });
      tx.subscription.findUnique.mockResolvedValue({
        planId: 'plan-business',
        pendingPlanId: 'plan-lite',
      });

      await service.handle(rawBody, 'sig');

      const arg = tx.subscription.upsert.mock.calls[0][0];
      expect(arg.update).toMatchObject({
        planId: 'plan-lite',
        pendingPlanId: null,
        stripeScheduleId: null,
      });
      // The plan behind the allowance moved, so the ceiling is recomputed.
      expect(generationCredits.getUsageInTransaction).toHaveBeenCalledWith(
        tx,
        'user-1',
      );
    });

    it('leaves the allowance alone when the plan did not move', async () => {
      const event = phaseTransition();
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.plan.findFirst.mockResolvedValue({ id: 'plan-lite' });
      tx.subscription.findUnique.mockResolvedValue({
        planId: 'plan-lite',
        pendingPlanId: null,
      });

      await service.handle(rawBody, 'sig');

      expect(generationCredits.getUsageInTransaction).not.toHaveBeenCalled();
    });

    it('forgets a queued change once its schedule is released', async () => {
      const event = makeEvent('subscription_schedule.released');
      event.data.object = { id: 'sched_1', customer: 'cus_123' };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);

      await service.handle(rawBody, 'sig');

      expect(tx.subscription.updateMany).toHaveBeenCalledWith({
        where: { stripeScheduleId: 'sched_1' },
        data: expect.objectContaining({
          pendingPlanId: null,
          stripeScheduleId: null,
        }),
      });
    });
  });

  describe('audit trail', () => {
    it('links the recorded event to the subscription it belongs to', async () => {
      const event = makeEvent('customer.subscription.updated');
      event.data.object = {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId: 'user-1' },
        items: { data: [{ price: { id: 'price_x' } }] },
      };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.subscription.findFirst.mockResolvedValue({ id: 'sub-row-1' });

      await service.handle(rawBody, 'sig');

      expect(tx.subscriptionEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-row-1' },
        data: { subscriptionId: 'sub-row-1' },
      });
    });

    it('does not guess a subscription when the event names none', async () => {
      const event = makeEvent('customer.updated');
      event.data.object = {};
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);

      await service.handle(rawBody, 'sig');

      // An unfiltered lookup would attach the event to whichever row came first.
      expect(tx.subscription.findFirst).not.toHaveBeenCalled();
      expect(tx.subscriptionEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('unhandled event types', () => {
    it('records the event but applies no handler', async () => {
      const event = makeEvent('charge.succeeded');
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(tx.subscriptionEvent.create).toHaveBeenCalled();
      expect(tx.subscription.update).not.toHaveBeenCalled();
      expect(tx.subscription.upsert).not.toHaveBeenCalled();
    });
  });
});
