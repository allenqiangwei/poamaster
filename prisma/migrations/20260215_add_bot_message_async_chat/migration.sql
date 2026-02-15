-- AlterTable: Add hasUnread column to BotConversation
ALTER TABLE "BotConversation" ADD COLUMN "hasUnread" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: BotMessage
CREATE TABLE "BotMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT,
    "errorMessage" TEXT,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotMessage_conversationId_idx" ON "BotMessage"("conversationId");

-- CreateIndex
CREATE INDEX "BotMessage_status_idx" ON "BotMessage"("status");

-- CreateIndex
CREATE INDEX "BotMessage_updatedAt_idx" ON "BotMessage"("updatedAt");

-- AddForeignKey
ALTER TABLE "BotMessage" ADD CONSTRAINT "BotMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "BotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
