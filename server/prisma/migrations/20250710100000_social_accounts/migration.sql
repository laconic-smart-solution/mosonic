-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('ZERNIO');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL DEFAULT 'ZERNIO',
    "channel" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT,
    "avatarUrl" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_accounts_userId_channel_idx" ON "social_accounts"("userId", "channel");

-- CreateIndex
CREATE INDEX "social_accounts_userId_status_idx" ON "social_accounts"("userId", "status");

-- CreateIndex
CREATE INDEX "social_accounts_provider_externalAccountId_idx" ON "social_accounts"("provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_userId_provider_channel_key" ON "social_accounts"("userId", "provider", "channel");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from users.zernioConnectedAccounts (array shape)
INSERT INTO "social_accounts" (
  "id",
  "userId",
  "provider",
  "channel",
  "externalAccountId",
  "status",
  "connectedAt",
  "lastSyncedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."userId",
  'ZERNIO'::"SocialProvider",
  lower(trim(elem->>'channel')),
  trim(elem->>'accountId'),
  'ACTIVE'::"SocialAccountStatus",
  COALESCE(
    CASE
      WHEN (elem->>'connectedAt') IS NOT NULL AND (elem->>'connectedAt') <> ''
        THEN (elem->>'connectedAt')::timestamp
      ELSE NULL
    END,
    CURRENT_TIMESTAMP
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(u."zernioConnectedAccounts"::jsonb) = 'array'
      THEN u."zernioConnectedAccounts"::jsonb
    ELSE '[]'::jsonb
  END
) AS elem
WHERE
  coalesce(trim(elem->>'channel'), '') <> ''
  AND coalesce(trim(elem->>'accountId'), '') <> ''
ON CONFLICT ("userId", "provider", "channel") DO UPDATE SET
  "externalAccountId" = EXCLUDED."externalAccountId",
  "status" = 'ACTIVE'::"SocialAccountStatus",
  "disconnectedAt" = NULL,
  "lastSyncedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Backfill from users.zernioConnectedAccounts (legacy map shape: { "instagram": "acc_..." })
INSERT INTO "social_accounts" (
  "id",
  "userId",
  "provider",
  "channel",
  "externalAccountId",
  "status",
  "connectedAt",
  "lastSyncedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."userId",
  'ZERNIO'::"SocialProvider",
  lower(trim(kv.key)),
  trim(kv.value),
  'ACTIVE'::"SocialAccountStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN LATERAL jsonb_each_text(
  CASE
    WHEN jsonb_typeof(u."zernioConnectedAccounts"::jsonb) = 'object'
      THEN u."zernioConnectedAccounts"::jsonb
    ELSE '{}'::jsonb
  END
) AS kv
WHERE
  coalesce(trim(kv.key), '') <> ''
  AND coalesce(trim(kv.value), '') <> ''
ON CONFLICT ("userId", "provider", "channel") DO UPDATE SET
  "externalAccountId" = EXCLUDED."externalAccountId",
  "status" = 'ACTIVE'::"SocialAccountStatus",
  "disconnectedAt" = NULL,
  "lastSyncedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP;
