-- CreateTable
CREATE TABLE "api_provider_billing_settings" (
    "provider" TEXT NOT NULL,
    "prepaidCreditUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_provider_billing_settings_pkey" PRIMARY KEY ("provider")
);

-- Migrate OpenAI settings if the old table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'open_ai_billing_settings'
  ) THEN
    INSERT INTO "api_provider_billing_settings" ("provider", "prepaidCreditUsd", "updatedBy", "createdAt", "updatedAt")
    SELECT 'openai', "prepaidCreditUsd", "updatedBy", "createdAt", "updatedAt"
    FROM "open_ai_billing_settings"
    WHERE "singletonKey" = 'default'
    ON CONFLICT ("provider") DO NOTHING;

    DROP TABLE "open_ai_billing_settings";
  END IF;
END $$;

-- Seed default rows for all providers
INSERT INTO "api_provider_billing_settings" ("provider", "prepaidCreditUsd", "updatedAt")
VALUES
  ('openai', 0, CURRENT_TIMESTAMP),
  ('heygen', 0, CURRENT_TIMESTAMP),
  ('zernio', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("provider") DO NOTHING;
