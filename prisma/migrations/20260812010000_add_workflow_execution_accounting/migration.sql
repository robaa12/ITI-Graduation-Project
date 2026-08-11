CREATE TYPE "WorkflowExecutionKind" AS ENUM (
  'STRATEGY',
  'STRATEGY_SECTION_REVISION',
  'CONTENT'
);

CREATE TYPE "WorkflowAccountingStatus" AS ENUM (
  'PENDING',
  'READY',
  'UNPRICED',
  'UNAVAILABLE'
);

CREATE TABLE "workflow_execution" (
  "id" TEXT NOT NULL,
  "mastraRunId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "kind" "WorkflowExecutionKind" NOT NULL,
  "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(20,10),
  "costUnit" TEXT,
  "accountingStatus" "WorkflowAccountingStatus" NOT NULL DEFAULT 'PENDING',
  "modelBreakdown" JSONB,
  "usageCollectedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "strategyId" TEXT,
  "contentRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_execution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_execution_exactly_one_owner" CHECK (
    ("strategyId" IS NOT NULL AND "contentRunId" IS NULL)
    OR ("strategyId" IS NULL AND "contentRunId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "workflow_execution_mastraRunId_key"
  ON "workflow_execution"("mastraRunId");
CREATE INDEX "workflow_execution_strategyId_createdAt_idx"
  ON "workflow_execution"("strategyId", "createdAt");
CREATE INDEX "workflow_execution_contentRunId_createdAt_idx"
  ON "workflow_execution"("contentRunId", "createdAt");
CREATE INDEX "workflow_execution_accountingStatus_idx"
  ON "workflow_execution"("accountingStatus");

ALTER TABLE "workflow_execution"
  ADD CONSTRAINT "workflow_execution_strategyId_fkey"
  FOREIGN KEY ("strategyId") REFERENCES "marketing_strategy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_execution"
  ADD CONSTRAINT "workflow_execution_contentRunId_fkey"
  FOREIGN KEY ("contentRunId") REFERENCES "campaign_content_run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
