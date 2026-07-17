-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('info', 'warning', 'critical');

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "level" "AnnouncementLevel" NOT NULL DEFAULT 'info';

-- CreateIndex
CREATE INDEX "announcements_status_publishedAt_idx" ON "announcements"("status", "publishedAt" DESC);
