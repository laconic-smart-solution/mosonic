-- RenameColumn
ALTER TABLE "chat_messages" RENAME COLUMN "toolCalls" TO "steps";

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "chat_messages" ADD COLUMN "outputTokens" INTEGER;
