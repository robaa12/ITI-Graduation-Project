import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AdminBillingSubscriptionsQueryDto } from './dto/admin-billing-subscriptions-query.dto';
import { AdminBillingPlansQueryDto } from './dto/admin-billing-plans-query.dto';
import { AdminBillingQuotesQueryDto } from './dto/admin-billing-quotes-query.dto';
import { AdminBillingEventsQueryDto } from './dto/admin-billing-events-query.dto';
import { AdminBillingCreditEventsQueryDto } from './dto/admin-billing-credit-events-query.dto';
import type {
  AdminBillingOverview,
  AdminGenerationCreditEventListItem,
  AdminPlan,
  AdminPlanChangeQuoteDetail,
  AdminPlanChangeQuoteListItem,
  AdminSubscriptionDetail,
  AdminSubscriptionEventDetail,
  AdminSubscriptionEventListItem,
  AdminSubscriptionListItem,
} from './types/admin-billing.types';

@Injectable()
export class AdminBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async listSubscriptions(query: AdminBillingSubscriptionsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      status,
      planId,
      userId,
      search,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.SubscriptionWhereInput = {};
    if (status) where.status = status;
    if (planId) where.planId = planId;
    if (userId) where.userId = userId;
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.user = {
        OR: [
          { name: { contains: normalizedSearch, mode: 'insensitive' } },
          { email: { contains: normalizedSearch, mode: 'insensitive' } },
        ],
      };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.SubscriptionOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.subscriptionSelect,
          ...this.subscriptionRefsSelect,
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data: items.map((item): AdminSubscriptionListItem =>
        this.presentSubscription(item),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSubscription(id: string): Promise<AdminSubscriptionDetail> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      select: {
        ...this.subscriptionSelect,
        ...this.subscriptionRefsSelect,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripePriceId: true,
        checkoutSessionId: true,
        stripeScheduleId: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    const [quoteCount, eventCount] = await Promise.all([
      this.prisma.planChangeQuote.count({ where: { subscriptionId: id } }),
      this.prisma.subscriptionEvent.count({ where: { subscriptionId: id } }),
    ]);

    return {
      ...this.presentSubscription(subscription),
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripePriceId: subscription.stripePriceId,
      checkoutSessionId: subscription.checkoutSessionId,
      stripeScheduleId: subscription.stripeScheduleId,
      quoteCount,
      eventCount,
    };
  }

  async listPlans(query: AdminBillingPlansQueryDto) {
    const { page = 1, limit = 20, sortBy, sortOrder, active } = query;

    const where: Prisma.PlanWhereInput = {};
    if (active !== undefined) where.active = active === 'true';

    const orderBy: Prisma.PlanOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { sortOrder: 'asc' };

    const [items, total] = await Promise.all([
      this.prisma.plan.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          ...this.planSelect,
          _count: { select: { subscriptions: true } },
        },
      }),
      this.prisma.plan.count({ where }),
    ]);

    return {
      data: items.map(({ _count, ...plan }): AdminPlan => ({
        ...plan,
        subscriberCount: _count.subscriptions,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPlan(id: string): Promise<AdminPlan> {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      select: {
        ...this.planSelect,
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    const { _count, ...rest } = plan;
    return { ...rest, subscriberCount: _count.subscriptions };
  }

  protected planSelect = {
    id: true,
    code: true,
    name: true,
    description: true,
    sortOrder: true,
    active: true,
    stripeProductId: true,
    priceMonthlyCents: true,
    priceYearlyCents: true,
    generationCredits: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.PlanSelect;

  async listQuotes(query: AdminBillingQuotesQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      userId,
      planId,
      kind,
      consumed,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.PlanChangeQuoteWhereInput = {};
    if (userId) where.userId = userId;
    if (planId) where.planId = planId;
    if (kind) where.kind = kind;
    if (consumed !== undefined) {
      where.consumedAt = consumed === 'true' ? { not: null } : null;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.PlanChangeQuoteOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.planChangeQuote.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          subscriptionId: true,
          userId: true,
          kind: true,
          planId: true,
          interval: true,
          amountDueCents: true,
          currency: true,
          unusedCreditCents: true,
          newPlanChargeCents: true,
          effectiveAt: true,
          expiresAt: true,
          consumedAt: true,
          createdAt: true,
          subscription: {
            select: { user: { select: { id: true, name: true, email: true } } },
          },
          plan: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.planChangeQuote.count({ where }),
    ]);

    return {
      data: items.map(
        ({ subscription, ...quote }): AdminPlanChangeQuoteListItem => ({
          ...quote,
          user: subscription.user,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getQuote(id: string): Promise<AdminPlanChangeQuoteDetail> {
    const quote = await this.prisma.planChangeQuote.findUnique({
      where: { id },
      select: {
        id: true,
        subscriptionId: true,
        userId: true,
        kind: true,
        planId: true,
        interval: true,
        fromPriceId: true,
        targetPriceId: true,
        amountDueCents: true,
        currency: true,
        unusedCreditCents: true,
        newPlanChargeCents: true,
        creditsLimit: true,
        creditsUsed: true,
        creditsNewLimit: true,
        effectiveAt: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
        subscription: {
          select: {
            id: true,
            status: true,
            user: { select: { id: true, name: true, email: true } },
            plan: { select: { id: true, code: true, name: true } },
          },
        },
        plan: { select: { id: true, code: true, name: true } },
      },
    });

    if (!quote) {
      throw new NotFoundException(`Plan change quote with ID ${id} not found`);
    }

    const { subscription, ...rest } = quote;
    return {
      ...rest,
      user: subscription.user,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            plan: subscription.plan,
          }
        : null,
    };
  }

  async listEvents(query: AdminBillingEventsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      type,
      subscriptionId,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.SubscriptionEventWhereInput = {};
    if (subscriptionId) where.subscriptionId = subscriptionId;
    const normalizedType = type?.trim();
    if (normalizedType) {
      where.type = { contains: normalizedType, mode: 'insensitive' };
    }
    if (from || to) {
      where.processedAt = {};
      if (from) where.processedAt.gte = new Date(from);
      if (to) where.processedAt.lte = new Date(to);
    }

    const orderBy: Prisma.SubscriptionEventOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { processedAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.subscriptionEvent.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          stripeEventId: true,
          type: true,
          subscriptionId: true,
          processedAt: true,
        },
      }),
      this.prisma.subscriptionEvent.count({ where }),
    ]);

    return {
      data: items.map((item): AdminSubscriptionEventListItem => ({ ...item })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getEvent(id: string): Promise<AdminSubscriptionEventDetail> {
    const event = await this.prisma.subscriptionEvent.findUnique({
      where: { id },
      select: {
        id: true,
        stripeEventId: true,
        type: true,
        subscriptionId: true,
        processedAt: true,
        payload: true,
        subscription: {
          select: {
            id: true,
            status: true,
            plan: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Subscription event with ID ${id} not found`);
    }

    return {
      id: event.id,
      stripeEventId: event.stripeEventId,
      type: event.type,
      subscriptionId: event.subscriptionId,
      processedAt: event.processedAt,
      payload: sanitizeStripePayload(event.payload),
      subscription: event.subscription,
    };
  }

  async listCreditEvents(query: AdminBillingCreditEventsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      userId,
      kind,
      refunded,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.GenerationCreditEventWhereInput = {};
    if (userId) where.userId = userId;
    if (kind) where.kind = kind;
    if (refunded !== undefined) {
      where.refundedAt = refunded === 'true' ? { not: null } : null;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.GenerationCreditEventOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.generationCreditEvent.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          referenceId: true,
          kind: true,
          amount: true,
          periodStart: true,
          refundedAt: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.generationCreditEvent.count({ where }),
    ]);

    return {
      data: items.map((item): AdminGenerationCreditEventListItem => ({
        ...item,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCreditEvent(
    id: string,
  ): Promise<AdminGenerationCreditEventListItem> {
    const event = await this.prisma.generationCreditEvent.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        referenceId: true,
        kind: true,
        amount: true,
        periodStart: true,
        refundedAt: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!event) {
      throw new NotFoundException(
        `Generation credit event with ID ${id} not found`,
      );
    }

    return event;
  }

  async getOverview(): Promise<AdminBillingOverview> {
    const [
      totalPlans,
      activePlans,
      totalSubscriptions,
      statusGroups,
      planGroups,
      pendingChangeCount,
      revenue,
      totalCreditEvents,
      refundedCreditEvents,
    ] = await Promise.all([
      this.prisma.plan.count(),
      this.prisma.plan.count({ where: { active: true } }),
      this.prisma.subscription.count(),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        _count: { _all: true },
      }),
      this.prisma.subscription.count({
        where: { pendingPlanId: { not: null } },
      }),
      this.prisma.planChangeQuote.aggregate({
        where: { consumedAt: { not: null } },
        _sum: { amountDueCents: true },
        _count: { _all: true },
      }),
      this.prisma.generationCreditEvent.count(),
      this.prisma.generationCreditEvent.count({
        where: { refundedAt: { not: null } },
      }),
    ]);

    const countFor = (status: SubscriptionStatus) =>
      statusGroups.find((group) => group.status === status)?._count._all ?? 0;

    const planIds = planGroups
      .map((group) => group.planId)
      .filter((id): id is string => id !== null);
    const plans = planIds.length
      ? await this.prisma.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, code: true },
        })
      : [];
    const codeByPlanId = new Map(plans.map((plan) => [plan.id, plan.code]));

    return {
      totalPlans,
      activePlans,
      totalSubscriptions,
      byStatus: statusGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
      byPlan: planGroups.map((group) => ({
        planCode: group.planId
          ? (codeByPlanId.get(group.planId) ?? null)
          : null,
        count: group._count._all,
      })),
      active: countFor(SubscriptionStatus.ACTIVE),
      trialing: countFor(SubscriptionStatus.TRIALING),
      pastDue: countFor(SubscriptionStatus.PAST_DUE),
      canceled: countFor(SubscriptionStatus.CANCELLED),
      pendingChangeCount,
      totalRevenueCents: revenue._sum.amountDueCents ?? 0,
      chargedPlanChanges: revenue._count._all,
      totalCreditEvents,
      refundedCreditEvents,
    };
  }

  protected subscriptionSelect = {
    id: true,
    userId: true,
    status: true,
    planId: true,
    billingInterval: true,
    currentPeriodStart: true,
    currentPeriodEnd: true,
    cancelAtPeriodEnd: true,
    canceledAt: true,
    pendingPlanId: true,
    pendingInterval: true,
    pendingEffectiveAt: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.SubscriptionSelect;

  protected subscriptionRefsSelect = {
    user: { select: { id: true, name: true, email: true } },
    plan: { select: { id: true, code: true, name: true } },
    pendingPlan: { select: { id: true, code: true, name: true } },
  } satisfies Prisma.SubscriptionSelect;

  protected presentSubscription(subscription: {
    id: string;
    userId: string;
    status: Prisma.SubscriptionGetPayload<object>['status'];
    planId: string | null;
    billingInterval: Prisma.SubscriptionGetPayload<object>['billingInterval'];
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    pendingPlanId: string | null;
    pendingInterval: Prisma.SubscriptionGetPayload<object>['pendingInterval'];
    pendingEffectiveAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; name: string; email: string };
    plan: { id: string; code: string; name: string } | null;
    pendingPlan: { id: string; code: string; name: string } | null;
  }): AdminSubscriptionListItem {
    return {
      id: subscription.id,
      userId: subscription.userId,
      status: subscription.status,
      planId: subscription.planId,
      billingInterval: subscription.billingInterval,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      pendingPlanId: subscription.pendingPlanId,
      pendingInterval: subscription.pendingInterval,
      pendingEffectiveAt: subscription.pendingEffectiveAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      user: subscription.user,
      plan: subscription.plan,
      pendingPlan: subscription.pendingPlan,
    };
  }
}

/** Keys whose values are never surfaced from a stored Stripe webhook payload. */
const SENSITIVE_PAYLOAD_KEYS = new Set([
  'client_secret',
  'idempotency_key',
  'api_key',
  'secret',
]);

/**
 * Recursively strips known-sensitive keys from a stored Stripe Event payload
 * before it is exposed to the admin dashboard. Stripe never includes card
 * numbers, but client secrets and idempotency keys are payment credentials
 * that an admin listing does not need.
 */
function sanitizeStripePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeStripePayload);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_PAYLOAD_KEYS.has(key)) continue;
      result[key] = sanitizeStripePayload(child);
    }
    return result;
  }
  return value;
}
