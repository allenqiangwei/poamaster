-- AlterTable
ALTER TABLE "BotConversation" ADD COLUMN "title" TEXT;
ALTER TABLE "BotConversation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'feishu';

-- CreateIndex
CREATE INDEX "BotConversation_source_idx" ON "BotConversation"("source");
