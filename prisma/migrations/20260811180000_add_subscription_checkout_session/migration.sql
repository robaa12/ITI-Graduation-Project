-- AddColumn
ALTER TABLE "subscription" ADD COLUMN "checkoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscription_checkoutSessionId_key" ON "subscription"("checkoutSessionId");