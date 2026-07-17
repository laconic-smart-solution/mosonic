-- Admin announcements: in-app + optional LINE broadcast history
CREATE TYPE "AnnouncementStatus" AS ENUM ('published', 'failed');

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'published',
    "sendInApp" BOOLEAN NOT NULL DEFAULT true,
    "sendLine" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inAppRecipientCount" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" INTEGER,
    "lineSent" INTEGER,
    "lineFailed" INTEGER,
    "lineFailedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_publishedAt_idx" ON "announcements"("publishedAt" DESC);
