# Subscription Billing API

This document describes the Stripe subscription endpoints exposed by the backend, how to configure Stripe Test Mode, and how to exercise the flows locally with the Stripe CLI.

## Base URL

```text
http://localhost:3000
```

All billing endpoints live below `/api/subscriptions` and require an authenticated session cookie (see `AUTH_API.md`). The webhook endpoint `/api/stripe/webhook` is public by design — Stripe calls it.

| Method | Endpoint | Purpose | Session required |
| --- | --- | --- | --- |
| `GET` | `/api/subscriptions/plans` | List purchasable plans | Yes |
| `GET` | `/api/subscriptions/me` | The current user's subscription | Yes |
| `POST` | `/api/subscriptions/checkout` | Start Stripe Checkout (subscription mode) | Yes |
| `PATCH` | `/api/subscriptions/plan` | Upgrade/downgrade the current plan | Yes |
| `POST` | `/api/subscriptions/cancel` | Cancel immediately | Yes |
| `POST` | `/api/stripe/webhook` | Stripe event delivery | No (signature-verified) |

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

```json
[
  {
    "code": "starter",
    "name": "Starter",
    "description": "For individuals",
    "sortOrder": 1
  },
  {
    "code": "pro",
    "name": "Pro",
    "description": "For teams",
    "sortOrder": 2
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
  "plan": {
    "code": "pro",
    "name": "Pro",
    "description": "For teams"
  }
}
```

### 3. Start Checkout

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

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `planCode` | `string` | Yes | Must match an existing active plan code |
| `interval` | `string` | Yes | `month` or `year` |

#### Success response (`201`)

```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc#fidkdWxOYH..."
}
```

The browser should be redirected to `url`. The user must be signed in before starting checkout so the session cookie is present.

If the user already has a live (active/trialing/past-due/unpaid) subscription, checkout is rejected with `409` — plan changes use the `PATCH /plan` endpoint instead, which prorates.

#### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid body, or the plan has no Price for the requested interval |
| `404` | Unknown or inactive plan code |
| `409` | User already has a live subscription |
| `503` | Stripe could not create the session |

### 4. Change Plan (Upgrade / Downgrade)

```http
PATCH /api/subscriptions/plan
Content-Type: application/json
```

#### Request body

```json
{
  "planCode": "pro",
  "interval": "month"
}
```

Same body rules as checkout. The backend updates the existing Stripe subscription and relies on Stripe's default proration behavior (`create_prorations`) to bill/credit the difference.

#### Success response (`200`)

The updated subscription object (same shape as `GET /subscriptions/me`).

#### Possible errors

| Status | Situation |
| --- | --- |
| `404` | No subscription exists for this user, or unknown plan |
| `400` | The target plan has no Price for the requested interval |
| `409` | The subscription has no Stripe subscription id yet |
| `503` | Stripe could not apply the change |

### 5. Cancel Subscription

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

| Status | Situation |
| --- | --- |
| `404` | No subscription for this user |
| `409` | Already cancelled, or no Stripe subscription id |
| `503` | Stripe could not cancel |

### 6. Stripe Webhook

```http
POST /api/stripe/webhook
Stripe-Signature: t=...,v1=...
```

Stripe calls this endpoint with subscription events. Signature verification is performed against the raw request body, so this route is intentionally excluded from the global JSON body parser (see `src/main.ts`). Unauthorized calls without a valid signature are rejected with `400`.

Handled events:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Attaches the real Stripe subscription id to the user's row |
| `customer.subscription.created` | Creates/syncs the local subscription row |
| `customer.subscription.updated` | Syncs plan, interval, price, status, periods |
| `customer.subscription.deleted` | Marks the local row `CANCELLED` |
| `invoice.payment_succeeded` | Re-activates / refreshes billing periods |
| `invoice.payment_failed` | Cancels the subscription (first failure removes access) |

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

| Price id (example) | Interval | Amount |
| --- | --- | --- |
| `price_1QmMonthly...` | Monthly | 29.00 |
| `price_1QmYearly...` | Yearly | 290.00 |

### 3. Persist the mapping

Insert one row per plan into the `plan` table with the Price ids from the Dashboard:

```sql
INSERT INTO "plan"
  ("id", "code", "name", "description", "sortOrder", "active",
   "stripeProductId", "stripeMonthlyPriceId", "stripeYearlyPriceId", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'starter', 'Starter', 'For individuals', 1, true,
   'prod_...', 'price_...monthly', 'price_...yearly', now()),
  (gen_random_uuid()::text, 'pro', 'Pro', 'For teams', 2, true,
   'prod_...', 'price_...monthly', 'price_...yearly', now());
```

### 4. Webhook signing secret

1. **Dashboard → Developers → Webhooks → Add endpoint** pointing at `http://localhost:3000/api/stripe/webhook`.
2. Select the events the backend listens for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
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
2. **Plan change**: after an active subscription exists, `PATCH /api/subscriptions/plan` with a different planCode. The Stripe `subscription.updated` event syncs the new price/interval.
3. **Cancel**: `POST /api/subscriptions/cancel` marks the row `CANCELLED`; `customer.subscription.deleted` confirms it.
4. **Failed renewal**: `stripe trigger invoice.payment_failed` cancels the Stripe subscription and removes access locally.

### 4. Test cards

| Card | Behavior |
| --- | --- |
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Declined payment (triggers `invoice.payment_failed` on renewal) |
| `4000 0027 6000 3184` | Requires authentication (3D Secure) |

## Webhook idempotency & consistency

- `SubscriptionEvent.stripeEventId` has a unique index; every delivery is recorded once inside a database transaction with its state change.
- Duplicate deliveries (Stripe retries, concurrent forward) are skipped, including the race where two deliveries pass the pre-check simultaneously — the unique constraint is caught and treated as already handled.
- Stripe is the source of truth; local state is mirrored from webhook events, and the webhook endpoint is signature-verified so state cannot be changed by unauthenticated callers.