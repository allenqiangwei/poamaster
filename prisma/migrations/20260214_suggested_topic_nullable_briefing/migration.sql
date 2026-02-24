-- Make briefingId nullable and add source column
ALTER TABLE "SuggestedTopic" DROP CONSTRAINT "SuggestedTopic_briefingId_fkey";
ALTER TABLE "SuggestedTopic" ALTER COLUMN "briefingId" DROP NOT NULL;
ALTER TABLE "SuggestedTopic" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'briefing';
ALTER TABLE "SuggestedTopic" ADD CONSTRAINT "SuggestedTopic_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "InsightBriefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
