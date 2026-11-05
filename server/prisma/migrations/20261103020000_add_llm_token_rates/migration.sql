-- CreateTable
CREATE TABLE "llm_token_rates" (
    "llmTokenRateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPerMToken" DOUBLE PRECISION NOT NULL,
    "outputPerMToken" DOUBLE PRECISION NOT NULL,
    "reasoningPerMToken" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_token_rates_pkey" PRIMARY KEY ("llmTokenRateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_token_rates_provider_model_key" ON "llm_token_rates"("provider", "model");
