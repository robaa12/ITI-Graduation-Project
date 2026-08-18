# Subscription Billing API

This document describes the Stripe subscription endpoints exposed by the backend, how to configure Stripe Test Mode, and how to exercise the flows locally with the Stripe CLI.

## Base URL

```text
http://localhost:3000
```

Billing endpoints live below `/api/subscriptions`. Plan listing is public for the pricing page; account-specific endpoints require an authenticated session cookie (see `AUTH_API.md`). The webhook endpoint `/api/stripe/webhook` is public by design — Stripe calls it.

| Method   | Endpoint                          | Purpose                                   | Session required        |
| -------- | --------------------------------- | ----------------------------------------- | ----------------------- |
| `GET`    | `/api/subscriptions/plans`        | List purchasable plans                    | No                      |
| `GET`    | `/api/subscriptions/me`           | The current user's subscription           | Yes                     |
| `GET`    | `/api/subscriptions/usage`        | Remaining generation credits              | Yes                     |
| `POST`   | `/api/subscriptions/checkout`     | Start Stripe Checkout (subscription mode) | Yes                     |
| `POST`   | `/api/subscriptions/plan/preview` | Quote a plan switch without applying it   | Yes                     |
| `PATCH`  | `/api/subscriptions/plan`         | Upgrade now, or schedule a downgrade      | Yes                     |
| `DELETE` | `/api/subscriptions/plan/pending` | Undo a scheduled downgrade                | Yes                     |
| `POST`   | `/api/subscriptions/cancel`       | Cancel immediately                        | Yes                     |
| `POST`   | `/api/subscriptions/portal`       | Open Stripe's customer portal             | Yes                     |
| `POST`   | `/api/stripe/webhook`             | Stripe event delivery                     | No (signature-verified) |

## How pricing is resolved

The client never sends a Stripe Price or a price id. It only sends an application plan code plus a billing interval, and the backend looks up the Stripe Price from the `plan` table:

```
client: { planCode: "pro", interval: "month" }
    │
    ▼
plan table → stripeMonthlyPriceId / stripeYearlyPriceId
    │
    ▼
Stripe Checkout Session / subscription update
```

Adding or re-pricing a plan is a database change, not a code change. The `plan` table columns used are `stripeProductId`, `stripeMonthlyPriceId`, and `stripeYearlyPriceId`.

## Endpoints

### 1. List Plans

```http
GET /api/subscriptions/plans
```

Returns active plans ordered by `sortOrder`, without internal Stripe Price ids.
This is the source of truth for prices and allowances; the frontend renders it
rather than keeping its own copy.

```json
[
  {
    "code": "free",
    "name": "Free",
    "description": "Explore the platform with basic limits.",
    "sortOrder": 1,
    "priceMonthlyCents": 0,
    "priceYearlyCents": 0,
    "generationCredits": 4
  },
  {
    "code": "pro",
    "name": "Pro",
    "description": "For individual professionals who need more.",
    "sortOrder": 2,
    "priceMonthlyCents": 2500,
    "priceYearlyCents": 25000,
    "generationCredits": 40
  },
  {
    "code": "business",
    "name": "Business",
    "description": "For growing teams.",
    "sortOrder": 3,
    "priceMonthlyCents": 5000,
    "priceYearlyCents": 50000,
    "generationCredits": 100
  }
]
```

### 2. Get Current Subscription

```http
GET /api/subscriptions/me
```

Returns the authenticated user's subscription with its plan, or `null`.

```json
{
  "id": "9f1c0a6e-...",
  "planId": "0b3e12aa-...",
  "status": "ACTIVE",
  "billingInterval": "MONTHLY",
  "stripeCustomerId": "cus_Q1n...",
  "stripeSubscriptionId": "sub_1Qm...",
  "stripePriceId": "price_1Qm...",
  "checkoutSessionId": "cs_test_...",
  "currentPeriodStart": "2026-08-11T10:00:00.000Z",
  "currentPeriodEnd": "2026-09-11T10:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "canceledAt": null,
  "pendingPlanId": null,
  "pendingInterval": null,
  "pendingEffectiveAt": null,
  "plan": {
    "code": "pro",
    "name": "Pro",
    "description": "For teams"
  },
  "pendingPlan": null
}
```

When a downgrade is queued, `pendingPlan` describes what the subscription becomes
and `pendingEffectiveAt` is when — the UI renders this as "Pro until Sep 12, then
Lite" alongside an undo action.

### 3. Credit Usage

```http
GET /api/subscriptions/usage
```

The allowance behind the plan, and why generation is blocked when it is.

```json
{
  "plan": { "code": "pro", "name": "Pro" },
  "limit": 60,
  "used": 55,
  "remaining": 5,
  "periodStart": "2026-08-12T10:00:00.000Z",
  "periodEnd": "2026-09-12T10:00:00.000Z",
  "canGenerate": true,
  "blockedReason": null
}
```

`blockedReason` is `payment_required`, `credits_exhausted`, or `null`.

The credit period is its own rolling month, anchored on the last reset — it is
deliberately **not** tied to the Stripe billing period. A mid-period plan change
moves `limit` only: `used`, `periodStart`, and `periodEnd` are preserved, so an
upgrade grants the difference rather than a second full allowance, and repeatedly
switching plans cannot mint credits.

### 4. Start Checkout

```http
POST /api/subscriptions/checkout
Content-Type: application/json
```

#### Request body

```json
{
  "planCode": "pro",
  "interval": "month"
}
```

| Field      | Type     | Required | Rules                                   |
| ---------- | -------- | -------- | --------------------------------------- |
| `planCode` | `string` | Yes      | Must match an existing active plan code |
| `interval` | `string` | Yes      | `month` or `year`                       |

#### Success response (`201`)

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc#fidkdWxOYH..."
}
```

The browser should be redirected to `url`. The user must be signed in before starting checkout so the session cookie is present.

If the user already has a live (active/trialing/past-due/unpaid) subscription, checkout is rejected with `409` — plan changes use the `PATCH /plan` endpoint instead, which prorates.

If the same user already has an open Checkout Session for the requested plan and interval, the endpoint returns that session's URL. When the user selects another plan, the backend expires the stale open Session and creates a fresh Session with the newly requested Price. Stripe idempotency keys protect concurrent retries from creating duplicate sessions.

#### Possible errors

| Status | Situation                                                         |
| ------ | ----------------------------------------------------------------- |
| `400`  | Invalid body, or the plan has no Price for the requested interval |
| `404`  | Unknown or inactive plan code                                     |
| `409`  | User already has a live subscription                              |
| `503`  | Stripe could not create the session                               |

### 5. Preview a Plan Change

```http
POST /api/subscriptions/plan/preview
Content-Type: application/json
```

Prices the switch without applying anything, and **holds that price** as a
single-use quote. Because Stripe recomputes proration on every preview call,
quoting and charging in two separate requests would otherwise let the figure move
between the two.

```json
{ "planCode": "business", "interval": "month" }
```

#### Success response (`200`)

```json
{
  "quoteId": "3f7c1a2e-...",
  "kind": "UPGRADE",
  "amountDueCents": 833,
  "currency": "usd",
  "isCredit": false,
  "effectiveAt": null,
  "expiresAt": "2026-08-14T10:15:00.000Z",
  "breakdown": {
    "unusedCreditCents": 500,
    "newPlanChargeCents": 1333
  },
  "credits": {
    "limit": 40,
    "used": 35,
    "newLimit": 100,
    "newRemaining": 65,
    "periodEnd": "2026-09-12T10:00:00.000Z"
  }
}
```

`kind` is `UPGRADE`, `DOWNGRADE`, or `NOOP` (already on that plan and interval,
in which case `quoteId` is `null`). `breakdown` explains the total instead of
asserting it. `credits` projects the allowance so the confirmation screen can say
"you have used 35 of 40; upgrading leaves you 65 of 100" — credits already spent
stay spent.

A downgrade quotes `amountDueCents: 0` with `effectiveAt` set to the end of the
paid period. Quotes expire after 15 minutes.

### 6. Change Plan

```http
PATCH /api/subscriptions/plan
Content-Type: application/json
```

#### Request body

```json
{
  "planCode": "business",
  "interval": "month",
  "quoteId": "3f7c1a2e-..."
}
```

`quoteId` is optional but recommended: with it the stored amount is charged, so
the customer pays the figure they were shown. Without it the switch is priced
fresh at confirmation time.

**Upgrades** (higher tier, or month → year on the same plan) are charged now. The
backend opens a payment-mode Stripe Checkout Session so payment details are always
entered on Stripe's hosted page; the `checkout.session.completed` webhook then
applies the target Price with `proration_behavior: none` — preventing a second
charge — and raises the credit allowance in the same transaction.

**Downgrades** (lower tier, or year → month) are scheduled for the end of the paid
period through a Stripe Subscription Schedule. Nothing is invoiced and nothing
changes today, so the customer keeps the higher plan and its credits for the time
they already bought. An upgrade releases any queued downgrade.

`planCode: "free"` is not a plan switch — there is no Price to move to — so it
sets `cancel_at_period_end` instead.

#### Success response (`200`)

```json
{
  "url": "https://checkout.stripe.com/c/pay/...",
  "kind": "UPGRADE",
  "scheduled": false,
  "effectiveAt": null
}
```

For a scheduled downgrade there is nothing to pay, so `url` is `null`:

```json
{
  "url": null,
  "kind": "DOWNGRADE",
  "scheduled": true,
  "effectiveAt": "2026-09-12T10:00:00.000Z"
}
```

#### Possible errors

| Status | Situation                                                                                    |
| ------ | -------------------------------------------------------------------------------------------- |
| `400`  | The target plan has no Price for the requested interval                                      |
| `404`  | No subscription exists for this user, or unknown plan                                        |
| `409`  | `SUBSCRIPTION_PAYMENT_REQUIRED` — an invoice is unpaid; the body carries `portalRequired`    |
| `409`  | `PLAN_CHANGE_QUOTE_STALE` — the quote expired or the price moved; the body carries a fresh `quote` to re-confirm |
| `503`  | Stripe could not calculate or start the plan change                                          |

### 7. Undo a Scheduled Downgrade

```http
DELETE /api/subscriptions/plan/pending
```

Releases the Stripe schedule and clears the pending columns, leaving the live
subscription untouched. Returns the refreshed subscription.

| Status | Situation                          |
| ------ | ---------------------------------- |
| `409`  | There is no scheduled change to undo |
| `503`  | Stripe could not release the schedule |

### 8. Cancel Subscription

```http
POST /api/subscriptions/cancel
```

Cancellation is **immediate** — Stripe subscription is canceled right away (not at period end). A user's local row is marked `CANCELLED` and the Stripe `customer.subscription.deleted` webhook finalizes state.

#### Success response (`200`)

```json
{
  "status": "CANCELLED",
  "cancelAtPeriodEnd": false,
  "canceledAt": "2026-08-11T12:00:00.000Z"
}
```

#### Possible errors

| Status | Situation                                       |
| ------ | ----------------------------------------------- |
| `404`  | No subscription for this user                   |
| `409`  | Already cancelled, or no Stripe subscription id |
| `503`  | Stripe could not cancel                         |

### 9. Stripe Webhook

```http
POST /api/stripe/webhook
Stripe-Signature: t=...,v1=...
```

Stripe calls this endpoint with subscription events. Signature verification is performed against the raw request body, so this route is intentionally excluded from the global JSON body parser (see `src/main.ts`). Unauthorized calls without a valid signature are rejected with `400`.

Handled events:

| Event                            | Effect                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `checkout.session.completed`     | Attaches a new subscription, or applies a paid plan change and its credits    |
| `customer.subscription.created`  | Creates/syncs the local subscription row                                     |
| `customer.subscription.updated`  | Syncs plan, interval, price, status, periods; resyncs credits if the plan moved |
| `customer.subscription.paused`   | Mirrors the paused status, which blocks generation                           |
| `customer.subscription.resumed`  | Restores the active status                                                   |
| `customer.subscription.deleted`  | Marks the local row `CANCELLED`                                              |
| `subscription_schedule.released` | Clears a queued plan change that is no longer governed by a schedule          |
| `subscription_schedule.canceled` | Same                                                                         |
| `invoice.payment_succeeded`      | Re-activates / refreshes billing periods                                     |
| `invoice.payment_failed`         | Cancels the matching subscription on a failed renewal                        |

A scheduled downgrade reaching its date arrives as `customer.subscription.updated`
with the new Price; that handler applies the plan, clears the pending columns, and
recomputes the allowance — so the lower credit ceiling lands with the lower plan.

All events are idempotent: the event id has a unique index and is recorded before any state change, so duplicate or concurrent deliveries never double-apply.

## Stripe Test Mode Configuration

### 1. Get a Stripe Account (Test Mode)

1. Create an account at https://dashboard.stripe.com — it starts in Test Mode.
2. From **Developers → API keys**, copy:
   - **Publishable key** (`pk_test_...`) — needed by the frontend, not this backend.
   - **Secret key** (`sk_test_...`) — placed in `STRIPE_SECRET_KEY`.

### 2. Create Products and Prices

In the Stripe Dashboard: **Products → Add product**.

Per plan, create a Product and two recurring Prices (one monthly, one yearly). The **Price ids** (`price_...`) are what the backend needs, not the product display names.

Example for a `pro` plan:

| Price id (example)    | Interval | Amount |
| --------------------- | -------- | ------ |
| `price_1QmMonthly...` | Monthly  | 29.00  |
| `price_1QmYearly...`  | Yearly   | 290.00 |

### 3. Persist the mapping

Normally this is done by the seeder, which reads the Stripe ids from environment
variables so they never land in committed code:

```bash
STRIPE_PLAN_PRO_PRODUCT_ID=prod_... \
STRIPE_PLAN_PRO_MONTHLY_PRICE_ID=price_... \
STRIPE_PLAN_PRO_YEARLY_PRICE_ID=price_... \
npm run db:seed
```

`sortOrder` is what ranks a switch as an upgrade or a downgrade, so plans must be
ordered cheapest to most expensive. To insert by hand:

```sql
INSERT INTO "plan"
  ("id", "code", "name", "description", "sortOrder", "active",
   "stripeProductId", "stripeMonthlyPriceId", "stripeYearlyPriceId",
   "priceMonthlyCents", "priceYearlyCents", "generationCredits", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'pro', 'Pro', 'For individuals', 2, true,
   'prod_...', 'price_...monthly', 'price_...yearly', 2500, 25000, 40, now()),
  (gen_random_uuid()::text, 'business', 'Business', 'For teams', 3, true,
   'prod_...', 'price_...monthly', 'price_...yearly', 5000, 50000, 100, now());
```

### 4. Webhook signing secret

1. **Dashboard → Developers → Webhooks → Add endpoint** pointing at `http://localhost:3000/api/stripe/webhook`.
2. Select the events the backend listens for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `customer.subscription.deleted`
   - `subscription_schedule.released`
   - `subscription_schedule.canceled`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
3. After saving, reveal the **Signing secret** (`whsec_...`) and put it in `STRIPE_WEBHOOK_SECRET`.

> Local delivery of these events is normally done with the Stripe CLI forward instead (see below), which gives you the same signing secret without exposing localhost to Stripe.

### 5. Environment variables

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/billing?success=1
STRIPE_CANCEL_URL=http://localhost:5173/billing?canceled=1
```

`STRIPE_*` values are validated by Joi in `src/config/env.validation.ts`. The committed `.env.example` holds placeholders; real test keys belong only in your local, git-ignored `.env`.

## Testing Locally With Stripe CLI

### Install

https://docs.stripe.com/stripe-cli — on Windows a `stripe.exe` is available; otherwise it runs via Scoop/Homebrew. On macOS/Linux the server and CLI communicate transparently.

### 1. Log in

```bash
stripe login
```

### 2. Forward webhooks to the backend

In a terminal, start the backend (`npm run start:dev`), then forward test webhook events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a `whsec_...` signing secret when it starts:

```text
> Ready! Your webhook signing secret is whsec_123...
```

Put that exact secret in `STRIPE_WEBHOOK_SECRET` and restart the backend so signature verification passes.

### 3. Trigger the flows

With the forwarding running, use the CLI to send each event the backend handles:

```bash
# new checkout on a known price
stripe trigger checkout.session.completed

# subscription lifecycle
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted

# invoice / failed renewal
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

Each `stripe trigger` emits a realistic payload that the local forwarder signs and posts to the endpoint. To verify end-to-end behavior:

1. **Checkout**: open the URL returned by `POST /api/subscriptions/checkout` (a test card — e.g. `4242 4242 4242 4242` — is accepted automatically), complete, and watch the webhook flip the DB row from `INCOMPLETE` to `ACTIVE`.
2. **Upgrade with credits already spent** — the case worth checking by hand:
   subscribe to Pro, spend most of the allowance (run generations, or set
   `user.generationCreditsUsed` directly) so `/usage` reads `35` of `40`, then
   upgrade to Business. Confirm the checkout page shows the breakdown *and* the
   projection, pay, then verify `/usage` reads `limit 100`, `used 35`,
   `remaining 65`, with `generationCreditPeriodEnd` **unchanged**. Re-delivering
   the same event (`stripe events resend <id>`) must not move any of it.
3. **Downgrade**: `PATCH /api/subscriptions/plan` to a lower plan. Nothing is
   charged, `/me` reports `pendingPlan` and `pendingEffectiveAt`, and the current
   credits stay usable. `DELETE /api/subscriptions/plan/pending` undoes it.
4. **Cancel**: `POST /api/subscriptions/cancel` marks the row `CANCELLED`; `customer.subscription.deleted` confirms it.
5. **Failed renewal**: `stripe trigger invoice.payment_failed` cancels the Stripe subscription and removes access locally.

### 4. Test cards

| Card                  | Behavior                                                        |
| --------------------- | --------------------------------------------------------------- |
| `4242 4242 4242 4242` | Successful payment                                              |
| `4000 0000 0000 0002` | Declined payment (triggers `invoice.payment_failed` on renewal) |
| `4000 0027 6000 3184` | Requires authentication (3D Secure)                             |

## Webhook idempotency & consistency

- `SubscriptionEvent.stripeEventId` has a unique index; every delivery is recorded once inside a database transaction with its state change.
- Duplicate deliveries (Stripe retries, concurrent forward) are skipped, including the race where two deliveries pass the pre-check simultaneously — the unique constraint is caught and treated as already handled.
- Stripe is the source of truth; local state is mirrored from webhook events, and the webhook endpoint is signature-verified so state cannot be changed by unauthenticated callers.
- Credit top-ups ride inside the same transaction as the plan change, and only ever
  set `generationCreditLimit` to the plan's ceiling. Re-running one recomputes the
  same value, so a duplicate delivery cannot grant a second allowance.
- `PlanChangeQuote.consumedAt` is set the moment a quote gets a payment attached
  to it, so two tabs cannot open two Checkouts against the same quoted figure.
