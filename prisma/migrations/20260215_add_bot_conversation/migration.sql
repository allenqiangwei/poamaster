-- CreateTable
CREATE TABLE "BotConversation" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotConversation_chatId_key" ON "BotConversation"("chatId");

-- CreateIndex
CREATE INDEX "BotConversation_lastActiveAt_idx" ON "BotConversation"("lastActiveAt");
