-- CreateTable
CREATE TABLE "viber_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viberUserId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viber_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viber_connections_userId_key" ON "viber_connections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "viber_connections_viberUserId_key" ON "viber_connections"("viberUserId");

-- AddForeignKey
ALTER TABLE "viber_connections" ADD CONSTRAINT "viber_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
