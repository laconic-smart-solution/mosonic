-- AlterTable
ALTER TABLE "pipelines" ADD COLUMN IF NOT EXISTS "sourcePack" JSONB;
