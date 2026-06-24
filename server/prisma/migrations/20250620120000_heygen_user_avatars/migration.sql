-- CreateTable
CREATE TABLE "heygen_user_avatars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "previewImageUrl" TEXT,
    "avatarType" TEXT NOT NULL DEFAULT 'photo_avatar',
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "heygen_user_avatars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "heygen_user_avatars_lookId_key" ON "heygen_user_avatars"("lookId");

-- CreateIndex
CREATE INDEX "heygen_user_avatars_userId_createdAt_idx" ON "heygen_user_avatars"("userId", "createdAt" DESC);
