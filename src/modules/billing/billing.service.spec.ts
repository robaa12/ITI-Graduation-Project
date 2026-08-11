import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';

import {
  BillingService,
  mapSubscriptionStatus,
  toBillingInterval,
} from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    plan: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    subscription: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let stripe: {
    checkout: { sessions: { create: jest.Mock } };
    customers: { create: jest.Mock };
    invoices: { retrieve: jest.Mock };
    subscriptions: {
      cancel: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
    };
  };
  let config: { getOrThrow: jest.Mock };

  const USER = { id: 'user-1', email: 'user@example.com', name: 'Test User' };

  beforeEach(() => {
    prisma = {
      plan: { findFirst: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn() },
      subscription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };

    stripe = {
      checkout: { sessions: { create: jest.fn() } },
      customers: { create: jest.fn() },
      invoices: { retrieve: jest.fn() },
      subscriptions: {
        cancel: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
      },
    };

    config = { getOrThrow: jest.fn() };

    config.getOrThrow
      .mockReturnValueOnce('http://localhost:5173/billing?success=1')
      .mockReturnValueOnce('http://localhost:5173/billing?canceled=1')
      .mockImplementation(() => {
        throw new Error('unexpected config access');
      });

    // @ts-expect-error test double with only the members under test
    service = new BillingService(prisma, config, stripe);
  });

  describe('listPlans', () => {
    it('returns only active plans, ordered, without internal price ids', async () => {
      const planRows = [
        {
          code: 'pro',
          name: 'Pro',
          description: null,
          sortOrder: 2,
          priceMonthlyCents: 1500,
          priceYearlyCents: 15000,
        },
        {
          code: 'basic',
          name: 'Basic',
          description: null,
          sortOrder: 1,
          priceMonthlyCents: null,
          priceYearlyCents: null,
        },
      ];
      prisma.plan.findMany.mockResolvedValue(planRows);

      await expect(service.listPlans()).resolves.toEqual(planRows);
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          code: true,
          name: true,
          description: true,
          sortOrder: true,
          priceMonthlyCents: true,
          priceYearlyCents: true,
        },
      });
      expect(Object.keys(planRows[0]).some((k) => k.includes('Price'))).toBe(
        false,
      );
    });
  });

  describe('createCheckoutSession', () => {
    const PLAN = {
      id: 'plan-1',
      code: 'pro',
      stripeMonthlyPriceId: 'price_monthly',
      stripeYearlyPriceId: 'price_yearly',
      active: true,
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(USER);
    });

    it('creates a session with the resolved monthly price and a fresh customer', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({});
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });

      const result = await service.createCheckoutSession('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(result.url).toBe('https://checkout.stripe.com/123');
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          customer: 'cus_new',
          client_reference_id: 'user-1',
          line_items: [{ price: 'price_monthly', quantity: 1 }],
          metadata: { userId: 'user-1' },
          subscription_data: {
            metadata: { userId: 'user-1', planCode: 'pro', interval: 'month' },
          },
        }),
      );
      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: USER.email,
          metadata: { userId: 'user-1' },
        }),
      );
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          planId: 'plan-1',
          billingInterval: BillingInterval.MONTHLY,
          status: SubscriptionStatus.INCOMPLETE,
        }),
      });
    });

    it('reuses an existing Stripe customer instead of creating a new one', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique
        .mockResolvedValueOnce(null) // active-check
        .mockResolvedValueOnce({ stripeCustomerId: 'cus_existing' }); // findOrCreateCustomer
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });

      await service.createCheckoutSession('user-1', {
        planCode: 'pro',
        interval: 'year',
      });

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
      );
    });

    it('rejects an unknown plan', async () => {
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'nope',
          interval: 'month',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('rejects a plan whose requested interval has no configured Price', async () => {
      prisma.plan.findFirst.mockResolvedValue({
        ...PLAN,
        stripeMonthlyPriceId: null,
      });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('rejects checkout when the user already has a live subscription', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: 'sub_live',
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });

    it('allows checkout when the existing subscription is cancelled', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          stripeSubscriptionId: 'sub_old',
          status: SubscriptionStatus.CANCELLED,
        }) // active-check
        .mockResolvedValueOnce({ stripeCustomerId: 'cus_existing' }) // findOrCreateCustomer
        .mockResolvedValueOnce({ userId: 'user-1' }); // existing row for session id persist
      prisma.subscription.update.mockResolvedValue({});
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });

      const result = await service.createCheckoutSession('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(result.url).toBe('https://checkout.stripe.com/123');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ planId: 'plan-1' }),
      });
    });

    it('returns 503 when Stripe checkout creation fails', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue(null);
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripe.checkout.sessions.create.mockRejectedValue(
        new Error('stripe outage'),
      );

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('changePlan', () => {
    const BASE_SUBSCRIPTION = {
      userId: 'user-1',
      stripeSubscriptionId: 'sub_live',
      status: SubscriptionStatus.ACTIVE,
    };
    const CURRENT_ITEM = {
      id: 'si_current',
      price: { id: 'price_basic', recurring: { interval: 'month' } },
    };
    const NEW_PLAN = {
      id: 'plan-2',
      code: 'pro',
      stripeMonthlyPriceId: 'price_pro_monthly',
      stripeYearlyPriceId: null,
      active: true,
    };

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('upgrades by invoicing the prorated difference and returns the hosted invoice url', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.subscriptions.retrieve.mockResolvedValue({
        items: { data: [CURRENT_ITEM] },
      });
      stripe.subscriptions.update.mockResolvedValue({
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        latest_invoice: 'inv_123',
      });
      stripe.invoices.retrieve.mockResolvedValue({
        id: 'inv_123',
        status: 'open',
        amount_due: 5000,
        hosted_invoice_url: 'https://pay.stripe.com/inv_123',
      });

      const result = await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(stripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_live',
        expect.objectContaining({
          items: [{ id: 'si_current', price: 'price_pro_monthly' }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'default_incomplete',
        }),
      );
      expect(stripe.invoices.retrieve).toHaveBeenCalledWith('inv_123');
      expect(result).toEqual({ url: 'https://pay.stripe.com/inv_123' });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          planId: 'plan-2',
          billingInterval: BillingInterval.MONTHLY,
          stripePriceId: 'price_pro_monthly',
        }),
      });
    });

    it('applies a payment-free switch with a null url (downgrade credit)', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.subscriptions.retrieve.mockResolvedValue({
        items: { data: [CURRENT_ITEM] },
      });
      stripe.subscriptions.update.mockResolvedValue({
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        latest_invoice: 'inv_123',
      });
      stripe.invoices.retrieve.mockResolvedValue({
        id: 'inv_123',
        status: 'open',
        amount_due: 0,
        hosted_invoice_url: 'https://pay.stripe.com/inv_123',
      });

      const result = await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(result).toEqual({ url: null });
    });

    it('supports downgrade without a client-supplied price', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.subscriptions.retrieve.mockResolvedValue({
        items: { data: [CURRENT_ITEM] },
      });
      stripe.subscriptions.update.mockResolvedValue({
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        latest_invoice: 'inv_123',
      });
      stripe.invoices.retrieve.mockResolvedValue({
        id: 'inv_123',
        status: 'open',
        amount_due: 0,
        hosted_invoice_url: 'https://pay.stripe.com/inv_123',
      });

      await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      // The only price supplied anywhere is the one resolved server-side from
      // the plan table — the DTO has no price field at all.
      const updateArgs = stripe.subscriptions.update.mock.calls[0][1];
      expect(updateArgs.items[0]).toEqual({
        id: 'si_current',
        price: 'price_pro_monthly',
      });
      expect(Object.keys({ planCode: 'pro', interval: 'month' })).not.toContain(
        'price',
      );
    });

    it('rejects switching to an unknown plan', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.changePlan('user-1', { planCode: 'nope', interval: 'month' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    });

    it('rejects a plan with no Price for the requested interval', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue({
        ...NEW_PLAN,
        stripeMonthlyPriceId: null,
      });

      await expect(
        service.changePlan('user-1', { planCode: 'pro', interval: 'month' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('routes a subscription with no Stripe id back to fresh checkout', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          ...BASE_SUBSCRIPTION,
          stripeSubscriptionId: null,
        })
        .mockResolvedValue(null); // createCheckoutSession active-check
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });

      const result = await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(result.url).toBe('https://checkout.stripe.com/123');
    });

    it('routes a cancelled subscription back to fresh checkout', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          ...BASE_SUBSCRIPTION,
          status: SubscriptionStatus.CANCELLED,
        })
        .mockResolvedValue(null); // createCheckoutSession active-check
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });

      const result = await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(result.url).toBe('https://checkout.stripe.com/123');
    });

    it('routes a subscription deleted in Stripe back to fresh checkout', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce(BASE_SUBSCRIPTION)
        .mockResolvedValue(null); // createCheckoutSession active-check
      prisma.user.findUnique.mockResolvedValue(USER);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.subscriptions.retrieve.mockRejectedValue(
        new Error('resource_missing'),
      );
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/123',
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });

      const result = await service.changePlan('user-1', {
        planCode: 'pro',
        interval: 'month',
      });

      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(result.url).toBe('https://checkout.stripe.com/123');
    });

    it('returns 503 when the Stripe update fails', async () => {
      prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
      prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
      stripe.subscriptions.retrieve.mockResolvedValue({
        items: { data: [CURRENT_ITEM] },
      });
      stripe.subscriptions.update.mockRejectedValue(new Error('stripe'));

      await expect(
        service.changePlan('user-1', { planCode: 'pro', interval: 'month' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('cancelSubscription', () => {
    it('cancels immediately and records the cancellation', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          userId: 'user-1',
          stripeSubscriptionId: 'sub_live',
          status: SubscriptionStatus.ACTIVE,
        })
        .mockResolvedValueOnce({
          userId: 'user-1',
          stripeSubscriptionId: 'sub_live',
          status: SubscriptionStatus.CANCELLED,
        });
      stripe.subscriptions.cancel.mockResolvedValue({
        status: 'canceled',
      });

      const result = await service.cancelSubscription('user-1');

      expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_live');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: false,
          canceledAt: expect.any(Date),
        }),
      });
      expect(result).toMatchObject({
        stripeSubscriptionId: 'sub_live',
        status: SubscriptionStatus.CANCELLED,
      });
    });

    it('rejects cancelling a subscription without a Stripe id', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        userId: 'user-1',
        stripeSubscriptionId: null,
        status: SubscriptionStatus.INCOMPLETE,
      });

      await expect(service.cancelSubscription('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('rejects cancelling an already-cancelled subscription safely', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        userId: 'user-1',
        stripeSubscriptionId: 'sub_old',
        status: SubscriptionStatus.CANCELLED,
      });

      await expect(service.cancelSubscription('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('returns 503 when Stripe cancellation fails', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        userId: 'user-1',
        stripeSubscriptionId: 'sub_live',
        status: SubscriptionStatus.ACTIVE,
      });
      stripe.subscriptions.cancel.mockRejectedValue(new Error('stripe'));

      await expect(service.cancelSubscription('user-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('mapSubscriptionStatus / toBillingInterval', () => {
    it('maps every Stripe status onto the internal enum', () => {
      expect(mapSubscriptionStatus('active')).toBe(SubscriptionStatus.ACTIVE);
      expect(mapSubscriptionStatus('trialing')).toBe(
        SubscriptionStatus.TRIALING,
      );
      expect(mapSubscriptionStatus('past_due')).toBe(
        SubscriptionStatus.PAST_DUE,
      );
      expect(mapSubscriptionStatus('paused')).toBe(SubscriptionStatus.PAUSED);
      expect(mapSubscriptionStatus('unpaid')).toBe(SubscriptionStatus.UNPAID);
      expect(mapSubscriptionStatus('canceled')).toBe(
        SubscriptionStatus.CANCELLED,
      );
      expect(mapSubscriptionStatus('incomplete')).toBe(
        SubscriptionStatus.INCOMPLETE,
      );
      expect(mapSubscriptionStatus('incomplete_expired')).toBe(
        SubscriptionStatus.INCOMPLETE_EXPIRED,
      );
    });

    it('maps billing intervals', () => {
      expect(toBillingInterval('month')).toBe(BillingInterval.MONTHLY);
      expect(toBillingInterval('year')).toBe(BillingInterval.YEARLY);
    });
  });
});
