-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUSPENDED', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "generated_content" ADD COLUMN     "contentRunId" TEXT;

-- CreateTable
CREATE TABLE "marketing_strategy" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "suspendPayload" JSONB,
    "error" TEXT,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_content_run" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "suspendPayload" JSONB,
    "error" TEXT,
    "contentCount" INTEGER NOT NULL DEFAULT 0,
    "campaignId" TEXT NOT NULL,
    "strategyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_content_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_strategy_runId_key" ON "marketing_strategy"("runId");

-- CreateIndex
CREATE INDEX "marketing_strategy_campaignId_idx" ON "marketing_strategy"("campaignId");

-- CreateIndex
CREATE INDEX "marketing_strategy_campaignId_status_idx" ON "marketing_strategy"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_content_run_runId_key" ON "campaign_content_run"("runId");

-- CreateIndex
CREATE INDEX "campaign_content_run_campaignId_idx" ON "campaign_content_run"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_content_run_campaignId_status_idx" ON "campaign_content_run"("campaignId", "status");

-- CreateIndex
CREATE INDEX "campaign_content_run_strategyId_idx" ON "campaign_content_run"("strategyId");

-- CreateIndex
CREATE INDEX "generated_content_contentRunId_idx" ON "generated_content"("contentRunId");

-- AddForeignKey
ALTER TABLE "marketing_strategy" ADD CONSTRAINT "marketing_strategy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_content_run" ADD CONSTRAINT "campaign_content_run_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_content_run" ADD CONSTRAINT "campaign_content_run_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "marketing_strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_content" ADD CONSTRAINT "generated_content_contentRunId_fkey" FOREIGN KEY ("contentRunId") REFERENCES "campaign_content_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
