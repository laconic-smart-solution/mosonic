-- AlterTable
ALTER TABLE "plans" ADD COLUMN "allowedChannels" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: existing plans keep full channel access until an admin tightens them individually.
UPDATE "plans" SET "allowedChannels" = ARRAY['facebook','instagram','youtube','linkedin','tiktok','rednote'];
