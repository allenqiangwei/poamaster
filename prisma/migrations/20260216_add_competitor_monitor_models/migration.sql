-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "appStoreId" TEXT,
    "googlePlayId" TEXT,
    "websiteUrl" TEXT,
    "monitorUrls" JSONB NOT NULL DEFAULT '[]',
    "rssFeeds" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAppSnapshot" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "version" TEXT,
    "releaseNotes" TEXT,
    "snapshotData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAppSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorReview" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "sentiment" DOUBLE PRECISION,
    "tags" JSONB,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorWebChange" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "summary" TEXT,
    "diffText" TEXT,
    "previousHash" TEXT,
    "currentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorWebChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorNews" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT,
    "impact" TEXT,
    "category" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorAlert" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_enabled_idx" ON "Competitor"("enabled");

-- CreateIndex
CREATE INDEX "CompetitorAppSnapshot_competitorId_createdAt_idx" ON "CompetitorAppSnapshot"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorReview_competitorId_reviewDate_idx" ON "CompetitorReview"("competitorId", "reviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorReview_platform_externalId_key" ON "CompetitorReview"("platform", "externalId");

-- CreateIndex
CREATE INDEX "CompetitorWebChange_competitorId_createdAt_idx" ON "CompetitorWebChange"("competitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorNews_url_key" ON "CompetitorNews"("url");

-- CreateIndex
CREATE INDEX "CompetitorNews_competitorId_createdAt_idx" ON "CompetitorNews"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorAlert_competitorId_createdAt_idx" ON "CompetitorAlert"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorAlert_acknowledged_idx" ON "CompetitorAlert"("acknowledged");

-- AddForeignKey
ALTER TABLE "CompetitorAppSnapshot" ADD CONSTRAINT "CompetitorAppSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorReview" ADD CONSTRAINT "CompetitorReview_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorWebChange" ADD CONSTRAINT "CompetitorWebChange_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorNews" ADD CONSTRAINT "CompetitorNews_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorAlert" ADD CONSTRAINT "CompetitorAlert_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
