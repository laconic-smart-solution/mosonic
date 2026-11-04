-- CreateEnum
CREATE TYPE "RuleMemoryType" AS ENUM ('preference', 'correction', 'fact');

-- CreateTable
CREATE TABLE "rule_memories" (
    "ruleMemoryId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "RuleMemoryType" NOT NULL,
    "body" TEXT NOT NULL,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_memories_pkey" PRIMARY KEY ("ruleMemoryId")
);

-- CreateIndex
CREATE INDEX "rule_memories_ruleId_createdAt_idx" ON "rule_memories"("ruleId", "createdAt" DESC);
