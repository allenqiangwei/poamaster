-- CreateTable: MonitoredGame
CREATE TABLE "MonitoredGame" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appStoreId" TEXT,
    "googlePlayId" TEXT,
    "xKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fbKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SentimentReview
CREATE TABLE "SentimentReview" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "keyIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SentimentMention
CREATE TABLE "SentimentMention" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "authorFollowers" INTEGER,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "keyIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engagement" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SentimentAlert
CREATE TABLE "SentimentAlert" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dataPoints" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SentimentDailyStat
CREATE TABLE "SentimentDailyStat" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "avgSentiment" DOUBLE PRECISION,
    "avgRating" DOUBLE PRECISION,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "topIssues" JSONB,
    "summary" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SentimentReview unique constraint
CREATE UNIQUE INDEX "SentimentReview_platform_externalId_key" ON "SentimentReview"("platform", "externalId");

-- CreateIndex: SentimentReview indexes
CREATE INDEX "SentimentReview_gameId_publishedAt_idx" ON "SentimentReview"("gameId", "publishedAt");
CREATE INDEX "SentimentReview_sentimentLabel_idx" ON "SentimentReview"("sentimentLabel");

-- CreateIndex: SentimentMention unique constraint
CREATE UNIQUE INDEX "SentimentMention_platform_externalId_key" ON "SentimentMention"("platform", "externalId");

-- CreateIndex: SentimentMention indexes
CREATE INDEX "SentimentMention_gameId_publishedAt_idx" ON "SentimentMention"("gameId", "publishedAt");
CREATE INDEX "SentimentMention_sentimentLabel_idx" ON "SentimentMention"("sentimentLabel");

-- CreateIndex: SentimentAlert indexes
CREATE INDEX "SentimentAlert_gameId_createdAt_idx" ON "SentimentAlert"("gameId", "createdAt");
CREATE INDEX "SentimentAlert_isRead_idx" ON "SentimentAlert"("isRead");

-- CreateIndex: SentimentDailyStat unique constraint
CREATE UNIQUE INDEX "SentimentDailyStat_gameId_date_key" ON "SentimentDailyStat"("gameId", "date");

-- AddForeignKey: SentimentReview -> MonitoredGame
ALTER TABLE "SentimentReview" ADD CONSTRAINT "SentimentReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SentimentMention -> MonitoredGame
ALTER TABLE "SentimentMention" ADD CONSTRAINT "SentimentMention_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SentimentAlert -> MonitoredGame
ALTER TABLE "SentimentAlert" ADD CONSTRAINT "SentimentAlert_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SentimentDailyStat -> MonitoredGame
ALTER TABLE "SentimentDailyStat" ADD CONSTRAINT "SentimentDailyStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
