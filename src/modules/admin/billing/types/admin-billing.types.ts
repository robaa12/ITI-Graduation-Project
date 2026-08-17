import type {
  BillingInterval,
  GenerationCreditKind,
  PlanChangeKind,
  SubscriptionStatus,
} from '@prisma/client';

/** Owning user reference on billing responses. */
export interface AdminBillingUserRef {
  id: string;
  name: string;
  email: string;
}

/** Plan reference on subscription and quote responses. */
export interface AdminBillingPlanRef {
  id: string;
  code: string;
  name: string;
}

/** One row of the admin subscription listing. */
export interface AdminSubscriptionListItem {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  planId: string | null;
  billingInterval: BillingInterval | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  pendingPlanId: string | null;
  pendingInterval: BillingInterval | null;
  pendingEffectiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: AdminBillingUserRef;
  plan: AdminBillingPlanRef | null;
  pendingPlan: AdminBillingPlanRef | null;
}

/** Full subscription view including Stripe identifiers and summaries. */
export interface AdminSubscriptionDetail extends AdminSubscriptionListItem {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  checkoutSessionId: string | null;
  stripeScheduleId: string | null;
  quoteCount: number;
  eventCount: number;
}

/** One row of the admin plan listing / detail. */
export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  stripeProductId: string;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  generationCredits: number;
  createdAt: Date;
  updatedAt: Date;
  subscriberCount: number;
}

/** One row of the admin plan-change quote listing. */
export interface AdminPlanChangeQuoteListItem {
  id: string;
  subscriptionId: string;
  userId: string;
  kind: PlanChangeKind;
  planId: string;
  interval: BillingInterval;
  amountDueCents: number;
  currency: string;
  unusedCreditCents: number;
  newPlanChargeCents: number;
  effectiveAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  user: AdminBillingUserRef;
  plan: AdminBillingPlanRef;
}

/** Full plan-change quote with the subscription it was created against. */
export interface AdminPlanChangeQuoteDetail extends AdminPlanChangeQuoteListItem {
  fromPriceId: string | null;
  targetPriceId: string;
  creditsLimit: number;
  creditsUsed: number;
  creditsNewLimit: number;
  subscription: AdminSubscriptionSummary | null;
}

/** One row of the admin Stripe subscription-event audit listing. */
export interface AdminSubscriptionEventListItem {
  id: string;
  stripeEventId: string;
  type: string;
  subscriptionId: string | null;
  processedAt: Date;
}

/** Full subscription event including the raw Stripe payload. */
export interface AdminSubscriptionEventDetail extends AdminSubscriptionEventListItem {
  payload: unknown;
  subscription: AdminSubscriptionSummary | null;
}

/** One row of the admin generation-credit-event listing. */
export interface AdminGenerationCreditEventListItem {
  id: string;
  userId: string;
  referenceId: string;
  kind: GenerationCreditKind;
  amount: number;
  periodStart: Date;
  refundedAt: Date | null;
  createdAt: Date;
  user: AdminBillingUserRef;
}

/** Aggregate billing statistics for the admin dashboard. */
export interface AdminBillingOverview {
  totalPlans: number;
  activePlans: number;
  totalSubscriptions: number;
  byStatus: Array<{ status: SubscriptionStatus; count: number }>;
  byPlan: Array<{ planCode: string | null; count: number }>;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  pendingChangeCount: number;
  totalRevenueCents: number;
  chargedPlanChanges: number;
  totalCreditEvents: number;
  refundedCreditEvents: number;
}

/** Minimal subscription reference on a subscription event detail. */
export interface AdminSubscriptionSummary {
  id: string;
  status: SubscriptionStatus;
  plan: AdminBillingPlanRef | null;
}
