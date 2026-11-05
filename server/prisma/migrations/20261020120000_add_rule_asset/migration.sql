-- CreateEnum
CREATE TYPE "RuleAssetType" AS ENUM ('logo', 'reference_image', 'guideline_document');

-- CreateEnum
CREATE TYPE "RuleAssetStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "rule_assets" (
    "ruleAssetId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "RuleAssetType" NOT NULL,
    "status" "RuleAssetStatus" NOT NULL DEFAULT 'pending',
    "fileUrl" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "aiDescription" TEXT,
    "extractedText" TEXT,
    "ragEnabled" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_assets_pkey" PRIMARY KEY ("ruleAssetId")
);

-- CreateTable
CREATE TABLE "rule_asset_chunks" (
    "ruleAssetChunkId" TEXT NOT NULL,
    "ruleAssetId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_asset_chunks_pkey" PRIMARY KEY ("ruleAssetChunkId")
);

-- CreateIndex
CREATE INDEX "rule_assets_ruleId_createdAt_idx" ON "rule_assets"("ruleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rule_assets_userId_updatedAt_idx" ON "rule_assets"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "rule_asset_chunks_ruleAssetId_chunkIndex_idx" ON "rule_asset_chunks"("ruleAssetId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "rule_asset_chunks" ADD CONSTRAINT "rule_asset_chunks_ruleAssetId_fkey" FOREIGN KEY ("ruleAssetId") REFERENCES "rule_assets"("ruleAssetId") ON DELETE CASCADE ON UPDATE CASCADE;
