ALTER TABLE "plan"
ADD COLUMN "generationCredits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "user"
ADD COLUMN "generationCreditsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "generationCreditLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "generationCreditPlanCode" TEXT,
ADD COLUMN "generationCreditPeriodStart" TIMESTAMP(3),
ADD COLUMN "generationCreditPeriodEnd" TIMESTAMP(3);

CREATE TYPE "GenerationCreditKind" AS ENUM (
  'STRATEGY',
  'STRATEGY_SECTION_REVISION',
  'CONTENT_WORKFLOW',
  'CONTENT_ITEM'
);

CREATE TABLE "generation_credit_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "kind" "GenerationCreditKind" NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 1,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "generation_credit_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generation_credit_event_referenceId_key"
ON "generation_credit_event"("referenceId");

CREATE INDEX "generation_credit_event_userId_createdAt_idx"
ON "generation_credit_event"("userId", "createdAt");

ALTER TABLE "generation_credit_event"
ADD CONSTRAINT "generation_credit_event_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the catalog available even when Stripe has not been configured yet.
-- Real Stripe ids are supplied by `prisma/seed.ts`; conflict updates preserve
-- any ids that are already configured in an environment.
INSERT INTO "plan" (
  "id", "code", "name", "description", "sortOrder", "active",
  "stripeProductId", "priceMonthlyCents", "priceYearlyCents",
  "generationCredits", "createdAt", "updatedAt"
)
VALUES
  ('catalog-plan-free', 'free', 'Free', 'A practical way to try strategy and content generation.', 1, true, 'catalog_free', 0, 0, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catalog-plan-pro', 'pro', 'Pro', 'For creators and marketers running campaigns every week.', 2, true, 'catalog_pro', 1500, 15000, 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('catalog-plan-business', 'business', 'Business', 'For growing teams with a larger production calendar.', 3, true, 'catalog_business', 4000, 40000, 240, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "active" = true,
  "priceMonthlyCents" = EXCLUDED."priceMonthlyCents",
  "priceYearlyCents" = EXCLUDED."priceYearlyCents",
  "generationCredits" = EXCLUDED."generationCredits",
  "updatedAt" = CURRENT_TIMESTAMP;
