-- CreateTable
CREATE TABLE "KeywordCombo" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "keywords" TEXT[],
    "score" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'active',
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "feedback" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordCombo_pkey" PRIMARY KEY ("id")
);

-- Add comboId to InsightCard
ALTER TABLE "InsightCard" ADD COLUMN "comboId" TEXT;

-- CreateIndex
CREATE INDEX "KeywordCombo_topicId_idx" ON "KeywordCombo"("topicId");
CREATE INDEX "KeywordCombo_status_score_idx" ON "KeywordCombo"("status", "score");
CREATE INDEX "InsightCard_comboId_idx" ON "InsightCard"("comboId");

-- AddForeignKey
ALTER TABLE "KeywordCombo" ADD CONSTRAINT "KeywordCombo_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "InsightTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsightCard" ADD CONSTRAINT "InsightCard_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "KeywordCombo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
