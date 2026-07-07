-- CreateEnum
CREATE TYPE "PlanPurchaseStatus" AS ENUM ('pending', 'active', 'cancelled');

-- CreateTable
CREATE TABLE "plan_purchases" (
    "planPurchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'THB',
    "billingPeriod" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" "PlanPurchaseStatus" NOT NULL DEFAULT 'pending',
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_purchases_pkey" PRIMARY KEY ("planPurchaseId")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_purchases_transactionId_key" ON "plan_purchases"("transactionId");

-- CreateIndex
CREATE INDEX "plan_purchases_userId_purchaseDate_idx" ON "plan_purchases"("userId", "purchaseDate" DESC);

-- CreateIndex
CREATE INDEX "plan_purchases_userId_billingPeriod_idx" ON "plan_purchases"("userId", "billingPeriod");

-- CreateIndex
CREATE INDEX "plan_purchases_status_idx" ON "plan_purchases"("status");
