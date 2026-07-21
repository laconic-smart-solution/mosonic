-- CreateTable
CREATE TABLE "wechat_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wechatOpenId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wechat_connections_userId_key" ON "wechat_connections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_connections_wechatOpenId_key" ON "wechat_connections"("wechatOpenId");

-- AddForeignKey
ALTER TABLE "wechat_connections" ADD CONSTRAINT "wechat_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
