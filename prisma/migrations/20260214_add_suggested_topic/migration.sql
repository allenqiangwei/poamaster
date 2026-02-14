-- CreateTable
CREATE TABLE "SuggestedTopic" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestedTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuggestedTopic_briefingId_idx" ON "SuggestedTopic"("briefingId");

-- AddForeignKey
ALTER TABLE "SuggestedTopic" ADD CONSTRAINT "SuggestedTopic_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "InsightBriefing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
