-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "chat_sessions" (
    "sessionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "messageId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE INDEX "chat_sessions_ruleId_updatedAt_idx" ON "chat_sessions"("ruleId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
