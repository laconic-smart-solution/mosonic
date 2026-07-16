-- Contact-only LINE identity (not a publish SocialAccount channel).
CREATE TABLE IF NOT EXISTS "line_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "line_connections_userId_key" ON "line_connections"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "line_connections_lineUserId_key" ON "line_connections"("lineUserId");

ALTER TABLE "line_connections"
  ADD CONSTRAINT "line_connections_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Move any mistaken LINE rows out of social_accounts into line_connections.
INSERT INTO "line_connections" ("id", "userId", "lineUserId", "connectedAt", "createdAt", "updatedAt")
SELECT sa."id",
       sa."userId",
       sa."externalAccountId",
       sa."connectedAt",
       NOW(),
       NOW()
FROM "social_accounts" sa
WHERE sa."provider"::text = 'LINE'
  AND sa."status"::text = 'ACTIVE'
ON CONFLICT ("userId") DO NOTHING;

DELETE FROM "social_accounts" WHERE "provider"::text = 'LINE';
