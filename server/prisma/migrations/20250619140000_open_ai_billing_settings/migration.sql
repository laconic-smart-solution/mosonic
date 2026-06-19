-- CreateTable
CREATE TABLE "open_ai_billing_settings" (
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "prepaidCreditUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_ai_billing_settings_pkey" PRIMARY KEY ("singletonKey")
);

-- Seed default row
INSERT INTO "open_ai_billing_settings" ("singletonKey", "prepaidCreditUsd", "updatedAt")
VALUES ('default', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("singletonKey") DO NOTHING;
