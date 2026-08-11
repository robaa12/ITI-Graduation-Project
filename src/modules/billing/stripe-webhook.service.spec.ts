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
    subscriptionEvent: { create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    subscriptionEvent: { findUnique: jest.Mock };
  };
  let stripe: {
    subscriptions: { cancel: jest.Mock; retrieve: jest.Mock };
    webhooks: { constructEvent: jest.Mock };
  };
  let config: { getOrThrow: jest.Mock };

  const makeEvent = (type: string, id = 'evt_1'): Stripe.Event =>
    ({ id, type, data: { object: {} } }) as unknown as Stripe.Event;

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
      subscriptionEvent: { create: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    prisma = {
      $transaction: jest.fn((run) => run(tx)),
      subscriptionEvent: { findUnique: jest.fn() },
    };

    stripe = {
      subscriptions: { cancel: jest.fn(), retrieve: jest.fn() },
      webhooks: { constructEvent: jest.fn() },
    };

    config = { getOrThrow: jest.fn().mockReturnValue('whsec_test') };

    // @ts-expect-error test double with only the members under test
    service = new StripeWebhookService(prisma, config, stripe);
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
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
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
            },
          ],
        },
      });
      tx.subscription.update.mockResolvedValue({});

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
        },
      });
    });
  });

  describe('invoice.payment_failed', () => {
    it('cancels the Stripe subscription and removes access on the first failure', async () => {
      const event = makeEvent('invoice.payment_failed');
      event.data.object = { id: 'in_123', customer: 'cus_123' };
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
      event.data.object = { id: 'in_123', customer: 'cus_123' };
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
      event.data.object = { id: 'in_123', customer: 'cus_unknown' };
      stripe.webhooks.constructEvent.mockReturnValue(event);
      prisma.subscriptionEvent.findUnique.mockResolvedValue(null);
      tx.subscription.findUnique.mockResolvedValue(null);

      await expect(service.handle(rawBody, 'sig')).resolves.toEqual({
        received: true,
      });
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(tx.subscription.updateMany).not.toHaveBeenCalled();
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
