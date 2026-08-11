-- Durable human review for marketing strategies. Content runs must point to an
-- approved strategy; events preserve comments and the reviewed strategy copy.
CREATE TYPE "StrategyApprovalStatus" AS ENUM ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

ALTER TABLE "marketing_strategy"
  ADD COLUMN "approvalStatus" "StrategyApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewerId" TEXT,
  ADD COLUMN "reviewerName" TEXT,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "pendingRevision" JSONB;

CREATE TABLE "strategy_review_event" (
  "id" TEXT NOT NULL,
  "action" "StrategyApprovalStatus" NOT NULL,
  "note" TEXT,
  "reviewerId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "output" JSONB,
  "strategyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_review_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_review_event_strategyId_createdAt_idx"
  ON "strategy_review_event"("strategyId", "createdAt");

ALTER TABLE "strategy_review_event"
  ADD CONSTRAINT "strategy_review_event_strategyId_fkey"
  FOREIGN KEY ("strategyId") REFERENCES "marketing_strategy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
