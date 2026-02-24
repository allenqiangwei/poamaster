-- CreateTable
CREATE TABLE "InsightTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'auto',
    "weight" INTEGER NOT NULL DEFAULT 50,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightBriefing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "feishuSent" BOOLEAN NOT NULL DEFAULT false,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightCard" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "topicId" TEXT,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "impact" TEXT,
    "action" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "relatedData" JSONB NOT NULL DEFAULT '{}',
    "feedback" INTEGER,
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightBriefing_date_key" ON "InsightBriefing"("date");

-- CreateIndex
CREATE INDEX "InsightCard_briefingId_idx" ON "InsightCard"("briefingId");

-- CreateIndex
CREATE INDEX "InsightCard_topicId_idx" ON "InsightCard"("topicId");

-- AddForeignKey
ALTER TABLE "InsightCard" ADD CONSTRAINT "InsightCard_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "InsightBriefing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightCard" ADD CONSTRAINT "InsightCard_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "InsightTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
