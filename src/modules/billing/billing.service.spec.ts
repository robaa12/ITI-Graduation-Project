import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';

import {
  BillingService,
  checkoutSuccessUrl,
  mapSubscriptionStatus,
  toBillingInterval,
} from './billing.service';

describe('checkoutSuccessUrl', () => {
  it('preserves the configured return flag and identifies the completed purchase', () => {
    expect(
      checkoutSuccessUrl(
        'http://localhost:5173/billing?success=1',
        'business',
        'year',
      ),
    ).toBe(
      'http://localhost:5173/billing?success=1&completedPlan=business&interval=year&session_id={CHECKOUT_SESSION_ID}',
    );
  });
});

describe('BillingService', () => {
  let service: BillingService;
  let prisma: {
    plan: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    subscription: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
    planChangeQuote: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let stripe: {
    billingPortal: { sessions: { create: jest.Mock } };
    checkout: {
      sessions: {
        create: jest.Mock;
        expire: jest.Mock;
        retrieve: jest.Mock;
      };
    };
    customers: { create: jest.Mock };
    invoices: { createPreview: jest.Mock; retrieve: jest.Mock };
    subscriptions: {
      cancel: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
    };
    subscriptionSchedules: {
      create: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
      release: jest.Mock;
    };
  };
  let config: { getOrThrow: jest.Mock };
  let generationCredits: {
    getUsage: jest.Mock;
    getUsageInTransaction: jest.Mock;
  };

  const USER = { id: 'user-1', email: 'user@example.com', name: 'Test User' };

  beforeEach(() => {
    prisma = {
      plan: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      subscription: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      planChangeQuote: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      // Interactive transactions run their callback against the same doubles.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };

    stripe = {
      billingPortal: { sessions: { create: jest.fn() } },
      checkout: {
        sessions: {
          create: jest.fn(),
          expire: jest.fn(),
          retrieve: jest.fn(),
        },
      },
      customers: { create: jest.fn() },
      invoices: { createPreview: jest.fn(), retrieve: jest.fn() },
      subscriptions: {
        cancel: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
      },
      subscriptionSchedules: {
        create: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
        release: jest.fn(),
      },
    };

    config = { getOrThrow: jest.fn() };
    generationCredits = {
      getUsage: jest.fn().mockResolvedValue({
        plan: { code: 'basic', name: 'Basic' },
        limit: 60,
        used: 55,
        remaining: 5,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-01T00:00:00.000Z'),
        canGenerate: true,
        blockedReason: null,
      }),
      getUsageInTransaction: jest.fn(),
    };

    config.getOrThrow
      .mockReturnValueOnce('http://localhost:5173/billing?success=1')
      .mockReturnValueOnce('http://localhost:5173/billing?canceled=1')
      .mockImplementation(() => {
        throw new Error('unexpected config access');
      });

    // @ts-expect-error test double with only the members under test
    service = new BillingService(prisma, config, generationCredits, stripe);
  });

  describe('getSubscription', () => {
    it('reconciles a completed Checkout immediately when its webhook is delayed', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          userId: 'user-1',
          planId: 'plan-1',
          plan: { id: 'plan-1', code: 'pro', name: 'Pro' },
          billingInterval: BillingInterval.MONTHLY,
          checkoutSessionId: 'cs_complete',
          stripeSubscriptionId: null,
          status: SubscriptionStatus.INCOMPLETE,
        })
        .mockResolvedValueOnce({
          userId: 'user-1',
          planId: 'plan-1',
          plan: { id: 'plan-1', code: 'pro', name: 'Pro' },
          stripeSubscriptionId: 'sub_live',
          status: SubscriptionStatus.ACTIVE,
        });
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_complete',
        status: 'complete',
        subscription: 'sub_live',
      });
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_live',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: {
          data: [
            {
              price: { id: 'price_monthly' },
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_592_000,
            },
          ],
        },
      });

      await expect(service.getSubscription('user-1')).resolves.toEqual(
        expect.objectContaining({
          stripeSubscriptionId: 'sub_live',
          status: SubscriptionStatus.ACTIVE,
        }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          stripeSubscriptionId: 'sub_live',
          stripePriceId: 'price_monthly',
          status: SubscriptionStatus.ACTIVE,
        }),
      });
    });
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
          generationCredits: 60,
          maxCampaignWeeks: 3,
          maxPostsPerWeek: 6,
          maxPlatforms: 3,
          allowsImageGeneration: true,
        },
        {
          code: 'basic',
          name: 'Basic',
          description: null,
          sortOrder: 1,
          priceMonthlyCents: null,
          priceYearlyCents: null,
          generationCredits: 0,
          maxCampaignWeeks: null,
          maxPostsPerWeek: null,
          maxPlatforms: null,
          allowsImageGeneration: true,
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
          generationCredits: true,
          maxCampaignWeeks: true,
          maxPostsPerWeek: true,
          maxPlatforms: true,
          allowsImageGeneration: true,
        },
      });
      expect(Object.keys(planRows[0]).some((k) => k.includes('Price'))).toBe(
        false,
      );
    });
  });

  describe('createBillingPortal', () => {
    it('opens Stripe payment settings for the authenticated customer', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        stripeCustomerId: 'cus_123',
      });
      config.getOrThrow.mockReset().mockReturnValue('http://localhost:5173');
      stripe.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/session/123',
      });

      await expect(service.createBillingPortal('user-1')).resolves.toEqual({
        url: 'https://billing.stripe.com/session/123',
      });
      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'http://localhost:5173/settings#billing',
      });
    });
  });

  describe('previewPlanChange', () => {
    it('prices an upgrade from Stripe without applying anything', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-row-1',
        userId: 'user-1',
        planId: 'plan-pro',
        stripeSubscriptionId: 'sub_pro',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      });
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-pro',
        code: 'pro',
        sortOrder: 2,
        generationCredits: 60,
      });
      prisma.plan.findFirst.mockResolvedValue({
        id: 'plan-business',
        code: 'business',
        name: 'Business',
        sortOrder: 3,
        generationCredits: 240,
        stripeMonthlyPriceId: 'price_business_monthly',
        stripeYearlyPriceId: 'price_business_yearly',
        active: true,
      });
      prisma.planChangeQuote.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'quote-1', consumedAt: null, ...data }),
      );
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_pro',
        items: {
          data: [
            {
              id: 'si_pro',
              price: {
                id: 'price_pro',
                currency: 'usd',
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      });
      stripe.invoices.createPreview.mockResolvedValue({
        total: 2499,
        currency: 'usd',
        lines: { data: [{ amount: 2499 }] },
      });

      await expect(
        service.previewPlanChange('user-1', {
          planCode: 'business',
          interval: 'month',
        }),
      ).resolves.toMatchObject({
        quoteId: 'quote-1',
        kind: 'UPGRADE',
        amountDueCents: 2499,
        currency: 'usd',
        isCredit: false,
      });
      expect(stripe.invoices.createPreview).toHaveBeenCalledWith({
        subscription: 'sub_pro',
        subscription_details: {
          items: [{ id: 'si_pro', price: 'price_business_monthly' }],
          proration_behavior: 'always_invoice',
        },
      });
      // Pricing is read-only: nothing about the live subscription moves.
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
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
          success_url:
            'http://localhost:5173/billing?success=1&completedPlan=pro&interval=month&session_id={CHECKOUT_SESSION_ID}',
          line_items: [{ price: 'price_monthly', quantity: 1 }],
          payment_method_types: ['card'],
          payment_method_collection: 'always',
          metadata: { userId: 'user-1' },
          subscription_data: {
            metadata: { userId: 'user-1', planCode: 'pro', interval: 'month' },
          },
        }),
        {
          idempotencyKey: 'checkout:user-1:initial:plan-1:month',
        },
      );
      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: USER.email,
          metadata: { userId: 'user-1' },
        }),
        { idempotencyKey: 'billing-customer:user-1' },
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

    it('creates an Elements Checkout Session for the custom UI', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({});
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_custom',
        url: null,
        ui_mode: 'elements',
        client_secret: 'cs_custom_secret_123',
      });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
          uiMode: 'custom',
        }),
      ).resolves.toEqual({
        url: null,
        clientSecret: 'cs_custom_secret_123',
        sessionId: 'cs_custom',
      });

      const [params] = stripe.checkout.sessions.create.mock.calls[0];
      const [, requestOptions] = stripe.checkout.sessions.create.mock.calls[0];
      expect(params).toEqual(
        expect.objectContaining({
          mode: 'subscription',
          ui_mode: 'elements',
          return_url:
            'http://localhost:5173/billing?success=1&completedPlan=pro&interval=month&session_id={CHECKOUT_SESSION_ID}',
          line_items: [{ price: 'price_monthly', quantity: 1 }],
          payment_method_types: ['card'],
        }),
      );
      expect(params).not.toHaveProperty('success_url');
      expect(params).not.toHaveProperty('cancel_url');
      expect(requestOptions).toEqual({
        idempotencyKey: 'checkout:user-1:initial:plan-1:month:elements',
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
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it('reuses an open Checkout Session for the same plan and interval', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-1',
        billingInterval: BillingInterval.MONTHLY,
        checkoutSessionId: 'cs_pending',
        stripeSubscriptionId: null,
        status: SubscriptionStatus.INCOMPLETE,
      });
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_pending',
        status: 'open',
        ui_mode: 'hosted_page',
        url: 'https://checkout.stripe.com/pending',
      });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
        }),
      ).resolves.toEqual({ url: 'https://checkout.stripe.com/pending' });

      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });

    it('expires a different open Checkout Session and creates the requested plan', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'another-plan',
        billingInterval: BillingInterval.YEARLY,
        checkoutSessionId: 'cs_pending',
        stripeCustomerId: 'cus_existing',
        stripeSubscriptionId: null,
        status: SubscriptionStatus.INCOMPLETE,
      });
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_pending',
        status: 'open',
        url: 'https://checkout.stripe.com/pending',
      });
      stripe.checkout.sessions.expire.mockResolvedValue({
        id: 'cs_pending',
        status: 'expired',
      });
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_replacement',
        url: 'https://checkout.stripe.com/replacement',
      });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'pro',
          interval: 'month',
        }),
      ).resolves.toEqual({ url: 'https://checkout.stripe.com/replacement' });

      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(
        'cs_pending',
      );
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_monthly', quantity: 1 }],
          payment_method_types: ['card'],
          payment_method_collection: 'always',
        }),
        {
          idempotencyKey: 'checkout:user-1:cs_pending:plan-1:month',
        },
      );
    });

    it('reconciles a completed checkout and continues a requested upgrade', async () => {
      prisma.plan.findFirst.mockResolvedValue(PLAN);
      prisma.subscription.findUnique.mockResolvedValue({
        planId: 'plan-pro',
        billingInterval: BillingInterval.MONTHLY,
        checkoutSessionId: 'cs_complete',
        stripeSubscriptionId: null,
        status: SubscriptionStatus.INCOMPLETE,
      });
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_complete',
        status: 'complete',
        subscription: 'sub_pro',
      });
      stripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_pro',
        status: 'active',
        cancel_at_period_end: false,
        canceled_at: null,
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      });
      const changePlan = jest
        .spyOn(service, 'changePlan')
        .mockResolvedValue({ url: 'https://invoice.stripe.com/upgrade' });

      await expect(
        service.createCheckoutSession('user-1', {
          planCode: 'business',
          interval: 'month',
        }),
      ).resolves.toEqual({ url: 'https://invoice.stripe.com/upgrade' });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          stripeSubscriptionId: 'sub_pro',
          status: SubscriptionStatus.ACTIVE,
        }),
      });
      expect(changePlan).toHaveBeenCalledWith('user-1', {
        planCode: 'business',
        interval: 'month',
      });
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
      id: 'sub-row-1',
      userId: 'user-1',
      planId: 'plan-1',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_live',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      stripeScheduleId: null,
    };
    const CURRENT_ITEM = {
      id: 'si_current',
      price: {
        id: 'price_basic',
        currency: 'usd',
        recurring: { interval: 'month' },
      },
    };
    /** The plan the subscription is on today, used to rank the switch. */
    const CURRENT_PLAN = {
      id: 'plan-1',
      code: 'basic',
      name: 'Basic',
      sortOrder: 1,
      generationCredits: 60,
    };
    const NEW_PLAN = {
      id: 'plan-2',
      code: 'pro',
      name: 'Pro',
      sortOrder: 2,
      generationCredits: 240,
      stripeMonthlyPriceId: 'price_pro_monthly',
      stripeYearlyPriceId: null,
      active: true,
    };
    const LOWER_PLAN = {
      id: 'plan-0',
      code: 'lite',
      name: 'Lite',
      sortOrder: 0,
      generationCredits: 20,
      stripeMonthlyPriceId: 'price_lite_monthly',
      stripeYearlyPriceId: null,
      active: true,
    };
    const LIVE_SUBSCRIPTION = {
      id: 'sub_live',
      customer: 'cus_123',
      items: { data: [CURRENT_ITEM] },
    };

    beforeEach(() => {
      prisma.plan.findUnique.mockResolvedValue(CURRENT_PLAN);
      prisma.planChangeQuote.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'quote-1',
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        }),
      );
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('upgrade', () => {
      it('opens Stripe Checkout for the prorated difference without charging the saved card', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: -500 }, { amount: 3000 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade',
          url: 'https://checkout.stripe.com/upgrade',
        });

        const result = await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'payment',
            customer: 'cus_123',
            success_url:
              'http://localhost:5173/billing?success=1&completedPlan=pro&interval=month&session_id={CHECKOUT_SESSION_ID}',
            payment_method_types: ['card'],
            line_items: [
              expect.objectContaining({
                price_data: expect.objectContaining({
                  currency: 'usd',
                  unit_amount: 2500,
                }),
                quantity: 1,
              }),
            ],
            metadata: expect.objectContaining({
              billingFlow: 'plan_change',
              stripeSubscriptionId: 'sub_live',
              sourcePriceId: 'price_basic',
              targetPriceId: 'price_pro_monthly',
              quoteId: 'quote-1',
            }),
          }),
          expect.objectContaining({
            idempotencyKey:
              'plan-change-checkout:sub_live:price_basic:price_pro_monthly:quote-1',
          }),
        );
        expect(result).toMatchObject({
          url: 'https://checkout.stripe.com/upgrade',
          scheduled: false,
        });
        // The price only moves once Stripe confirms the payment.
        expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      });

      it('returns an Elements client secret for a custom upgrade checkout', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: -500 }, { amount: 3000 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade_custom',
          url: null,
          ui_mode: 'elements',
          client_secret: 'cs_upgrade_custom_secret_123',
        });

        const result = await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
          uiMode: 'custom',
        });

        const [params, requestOptions] =
          stripe.checkout.sessions.create.mock.calls[0];
        expect(params).toEqual(
          expect.objectContaining({
            mode: 'payment',
            ui_mode: 'elements',
            return_url:
              'http://localhost:5173/billing?success=1&completedPlan=pro&interval=month&session_id={CHECKOUT_SESSION_ID}',
            customer: 'cus_123',
            payment_method_types: ['card'],
          }),
        );
        expect(params).not.toHaveProperty('success_url');
        expect(params).not.toHaveProperty('cancel_url');
        expect(requestOptions).toEqual({
          idempotencyKey:
            'plan-change-checkout:sub_live:price_basic:price_pro_monthly:quote-1:elements',
        });
        expect(result).toMatchObject({
          url: null,
          clientSecret: 'cs_upgrade_custom_secret_123',
          sessionId: 'cs_upgrade_custom',
          kind: 'UPGRADE',
          scheduled: false,
        });
      });

      it('records the money breakdown and the credit projection on the quote', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: -500 }, { amount: 3000 }] },
        });

        const quote = await service.previewPlanChange('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(prisma.planChangeQuote.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            kind: 'UPGRADE',
            amountDueCents: 2500,
            unusedCreditCents: 500,
            newPlanChargeCents: 3000,
            creditsLimit: 60,
            creditsUsed: 55,
            creditsNewLimit: 240,
          }),
        });
        // 55 already spent stay spent; the upgrade buys the difference.
        expect(quote.credits).toMatchObject({
          used: 55,
          newLimit: 240,
          newRemaining: 185,
        });
        expect(quote.breakdown).toEqual({
          unusedCreditCents: 500,
          newPlanChargeCents: 3000,
        });
      });

      it('charges the amount that was quoted, not a freshly recomputed one', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        prisma.planChangeQuote.findUnique.mockResolvedValue({
          id: 'quote-1',
          userId: 'user-1',
          kind: 'UPGRADE',
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          fromPriceId: 'price_basic',
          targetPriceId: 'price_pro_monthly',
          amountDueCents: 1234,
          currency: 'usd',
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade',
          url: 'https://checkout.stripe.com/upgrade',
        });

        await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
          quoteId: 'quote-1',
        });

        const [params] = stripe.checkout.sessions.create.mock.calls[0];
        expect(params.line_items[0].price_data.unit_amount).toBe(1234);
        // A confirmed quote is authoritative; Stripe is not asked again.
        expect(stripe.invoices.createPreview).not.toHaveBeenCalled();
      });

      it('rejects a stale quote with a fresh one to re-confirm', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        prisma.planChangeQuote.findUnique.mockResolvedValue({
          id: 'quote-1',
          userId: 'user-1',
          kind: 'UPGRADE',
          consumedAt: null,
          expiresAt: new Date(Date.now() - 60_000), // expired
          fromPriceId: 'price_basic',
          targetPriceId: 'price_pro_monthly',
          amountDueCents: 1234,
          currency: 'usd',
        });
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });

        await expect(
          service.changePlan('user-1', {
            planCode: 'pro',
            interval: 'month',
            quoteId: 'quote-1',
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'PLAN_CHANGE_QUOTE_STALE',
            quote: expect.objectContaining({ amountDueCents: 2500 }),
          }),
        });
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      });

      it('refuses a quote belonging to somebody else', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        prisma.planChangeQuote.findUnique.mockResolvedValue({
          id: 'quote-1',
          userId: 'someone-else',
          kind: 'UPGRADE',
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          fromPriceId: 'price_basic',
          targetPriceId: 'price_pro_monthly',
          amountDueCents: 1,
          currency: 'usd',
        });
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });

        await expect(
          service.changePlan('user-1', {
            planCode: 'pro',
            interval: 'month',
            quoteId: 'quote-1',
          }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('spends the quote so a second tab cannot reuse it', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade',
          url: 'https://checkout.stripe.com/upgrade',
        });

        await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(prisma.planChangeQuote.update).toHaveBeenCalledWith({
          where: { id: 'quote-1' },
          data: { consumedAt: expect.any(Date) },
        });
      });

      it('applies directly and resyncs credits when nothing is owed', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 0,
          currency: 'usd',
          lines: { data: [{ amount: -3000 }, { amount: 3000 }] },
        });
        stripe.subscriptions.update.mockResolvedValue({
          status: 'active',
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        });

        const result = await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(result).toMatchObject({ url: null, scheduled: false });
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
        expect(prisma.subscription.update).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            planId: 'plan-2',
            billingInterval: BillingInterval.MONTHLY,
            stripePriceId: 'price_pro_monthly',
          }),
        });
        // The allowance is raised in the same transaction as the plan.
        expect(generationCredits.getUsageInTransaction).toHaveBeenCalledWith(
          prisma,
          'user-1',
        );
      });

      it('drops a queued downgrade so it cannot undo the plan just paid for', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          pendingPlanId: 'plan-0',
          stripeScheduleId: 'sched_old',
        });
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade',
          url: 'https://checkout.stripe.com/upgrade',
        });

        await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith(
          'sched_old',
        );
        expect(prisma.subscription.update).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            pendingPlanId: null,
            stripeScheduleId: null,
          }),
        });
      });

      it('does not apply the plan when Stripe Checkout has no redirect URL', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_bad' });

        await expect(
          service.changePlan('user-1', { planCode: 'pro', interval: 'month' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        expect(stripe.subscriptions.update).not.toHaveBeenCalled();
      });

      it('treats month to year on the same plan as an upgrade', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue({
          ...CURRENT_PLAN,
          stripeMonthlyPriceId: 'price_basic',
          stripeYearlyPriceId: 'price_basic_yearly',
          active: true,
        });
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 12000,
          currency: 'usd',
          lines: { data: [{ amount: 12000 }] },
        });
        stripe.checkout.sessions.create.mockResolvedValue({
          id: 'cs_upgrade',
          url: 'https://checkout.stripe.com/upgrade',
        });

        const result = await service.changePlan('user-1', {
          planCode: 'basic',
          interval: 'year',
        });

        expect(result).toMatchObject({ kind: 'UPGRADE', scheduled: false });
        expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
      });
    });

    describe('downgrade', () => {
      const SCHEDULE = {
        id: 'sched_1',
        current_phase: { start_date: 1_700_000_000, end_date: 1_702_592_000 },
        phases: [
          {
            start_date: 1_700_000_000,
            end_date: 1_702_592_000,
            items: [{ price: 'price_basic', quantity: 1 }],
          },
        ],
      };

      beforeEach(() => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(LOWER_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.subscriptionSchedules.create.mockResolvedValue(SCHEDULE);
        stripe.subscriptionSchedules.update.mockResolvedValue(SCHEDULE);
      });

      it('schedules at the period end and charges nothing now', async () => {
        const result = await service.changePlan('user-1', {
          planCode: 'lite',
          interval: 'month',
        });

        expect(result).toEqual({
          url: null,
          kind: 'DOWNGRADE',
          scheduled: true,
          effectiveAt: BASE_SUBSCRIPTION.currentPeriodEnd,
        });
        // Nothing is invoiced and the live price is untouched, so the customer
        // keeps the plan and the credits they already paid for.
        expect(stripe.subscriptions.update).not.toHaveBeenCalled();
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      });

      it('leaves the current price running to the end of the paid period', async () => {
        await service.changePlan('user-1', {
          planCode: 'lite',
          interval: 'month',
        });

        expect(stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
          'sched_1',
          expect.objectContaining({
            end_behavior: 'release',
            phases: [
              expect.objectContaining({
                start_date: 1_700_000_000,
                end_date: 1_702_592_000,
                items: [{ price: 'price_basic', quantity: 1 }],
              }),
              expect.objectContaining({
                items: [{ price: 'price_lite_monthly', quantity: 1 }],
              }),
            ],
          }),
        );
      });

      it('records the pending change so the UI can offer an undo', async () => {
        await service.changePlan('user-1', {
          planCode: 'lite',
          interval: 'month',
        });

        expect(prisma.subscription.update).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          data: {
            pendingPlanId: 'plan-0',
            pendingInterval: BillingInterval.MONTHLY,
            pendingEffectiveAt: BASE_SUBSCRIPTION.currentPeriodEnd,
            stripeScheduleId: 'sched_1',
          },
        });
      });

      it('quotes zero with the date it takes effect', async () => {
        const quote = await service.previewPlanChange('user-1', {
          planCode: 'lite',
          interval: 'month',
        });

        expect(quote).toMatchObject({
          kind: 'DOWNGRADE',
          amountDueCents: 0,
          effectiveAt: BASE_SUBSCRIPTION.currentPeriodEnd,
        });
        expect(stripe.invoices.createPreview).not.toHaveBeenCalled();
      });

      it('rewrites an existing schedule rather than stacking a second one', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          pendingPlanId: 'plan-9',
          stripeScheduleId: 'sched_1',
        });
        stripe.subscriptionSchedules.retrieve.mockResolvedValue(SCHEDULE);

        await service.changePlan('user-1', {
          planCode: 'lite',
          interval: 'month',
        });

        expect(stripe.subscriptionSchedules.retrieve).toHaveBeenCalledWith(
          'sched_1',
        );
        expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
      });

      it('treats year to month on the same plan as a downgrade', async () => {
        prisma.plan.findFirst.mockResolvedValue({
          ...CURRENT_PLAN,
          stripeMonthlyPriceId: 'price_basic_monthly',
          stripeYearlyPriceId: 'price_basic_yearly',
          active: true,
        });
        stripe.subscriptions.retrieve.mockResolvedValue({
          ...LIVE_SUBSCRIPTION,
          items: {
            data: [
              {
                id: 'si_current',
                price: {
                  id: 'price_basic_yearly',
                  currency: 'usd',
                  recurring: { interval: 'year' },
                },
              },
            ],
          },
        });

        const result = await service.changePlan('user-1', {
          planCode: 'basic',
          interval: 'month',
        });

        expect(result).toMatchObject({ kind: 'DOWNGRADE', scheduled: true });
      });
    });

    describe('returning to Free', () => {
      it('ends the paid subscription when the paid period runs out', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue({
          id: 'plan-free',
          code: 'free',
        });
        stripe.subscriptions.update.mockResolvedValue({
          items: { data: [{ current_period_end: 1_702_592_000 }] },
        });

        const result = await service.changePlan('user-1', {
          planCode: 'free',
          interval: 'month',
        });

        expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_live', {
          cancel_at_period_end: true,
        });
        expect(result).toMatchObject({ scheduled: true });
        // Access is not cut off mid-period.
        expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      });

      it('rejects when there is no paid subscription to end', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          status: SubscriptionStatus.CANCELLED,
        });

        await expect(
          service.changePlan('user-1', { planCode: 'free', interval: 'month' }),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('cancelPendingPlanChange', () => {
      it('releases the schedule and clears the pending columns', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          pendingPlanId: 'plan-0',
          stripeScheduleId: 'sched_1',
        });

        await service.cancelPendingPlanChange('user-1');

        expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith(
          'sched_1',
        );
        expect(prisma.subscription.update).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            pendingPlanId: null,
            stripeScheduleId: null,
            cancelAtPeriodEnd: false,
          }),
        });
      });

      it('un-cancels a scheduled return to Free', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          pendingPlanId: 'plan-free',
          cancelAtPeriodEnd: true,
          stripeScheduleId: null,
        });

        await service.cancelPendingPlanChange('user-1');

        expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_live', {
          cancel_at_period_end: false,
        });
      });

      it('rejects when there is nothing scheduled', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);

        await expect(
          service.cancelPendingPlanChange('user-1'),
        ).rejects.toBeInstanceOf(ConflictException);
      });
    });

    describe('rejections and fallbacks', () => {
      it('blocks a plan change while a payment needs attention', async () => {
        prisma.subscription.findUnique.mockResolvedValue({
          ...BASE_SUBSCRIPTION,
          status: SubscriptionStatus.PAST_DUE,
        });
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);

        await expect(
          service.changePlan('user-1', { planCode: 'pro', interval: 'month' }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'SUBSCRIPTION_PAYMENT_REQUIRED',
            portalRequired: true,
          }),
        });
        expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
      });

      it('is a no-op when the subscription is already on that price', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue({
          ...NEW_PLAN,
          stripeMonthlyPriceId: 'price_basic',
        });
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);

        const result = await service.changePlan('user-1', {
          planCode: 'pro',
          interval: 'month',
        });

        expect(result).toMatchObject({ url: null, kind: 'NOOP' });
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
        expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
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

      it('returns 503 when Stripe cannot open the upgrade payment', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(NEW_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.invoices.createPreview.mockResolvedValue({
          total: 2500,
          currency: 'usd',
          lines: { data: [{ amount: 2500 }] },
        });
        stripe.checkout.sessions.create.mockRejectedValue(new Error('stripe'));

        await expect(
          service.changePlan('user-1', { planCode: 'pro', interval: 'month' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it('returns 503 when the downgrade cannot be scheduled', async () => {
        prisma.subscription.findUnique.mockResolvedValue(BASE_SUBSCRIPTION);
        prisma.plan.findFirst.mockResolvedValue(LOWER_PLAN);
        stripe.subscriptions.retrieve.mockResolvedValue(LIVE_SUBSCRIPTION);
        stripe.subscriptionSchedules.create.mockRejectedValue(
          new Error('stripe'),
        );

        await expect(
          service.changePlan('user-1', { planCode: 'lite', interval: 'month' }),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });
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
