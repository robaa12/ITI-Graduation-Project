-- CreateEnum
CREATE TYPE "PlanChangeKind" AS ENUM ('UPGRADE', 'DOWNGRADE');

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "pendingEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "pendingInterval" "BillingInterval",
ADD COLUMN     "pendingPlanId" TEXT,
ADD COLUMN     "stripeScheduleId" TEXT;

-- CreateTable
CREATE TABLE "plan_change_quote" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PlanChangeKind" NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "fromPriceId" TEXT,
    "targetPriceId" TEXT NOT NULL,
    "amountDueCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "unusedCreditCents" INTEGER NOT NULL,
    "newPlanChargeCents" INTEGER NOT NULL,
    "creditsLimit" INTEGER NOT NULL,
    "creditsUsed" INTEGER NOT NULL,
    "creditsNewLimit" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_change_quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_change_quote_userId_createdAt_idx" ON "plan_change_quote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "plan_change_quote_subscriptionId_idx" ON "plan_change_quote"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_stripeScheduleId_key" ON "subscription"("stripeScheduleId");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_quote" ADD CONSTRAINT "plan_change_quote_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_change_quote" ADD CONSTRAINT "plan_change_quote_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

