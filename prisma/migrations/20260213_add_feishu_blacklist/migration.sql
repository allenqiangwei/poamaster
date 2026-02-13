-- AlterTable: Add blacklist fields to FeishuChat
ALTER TABLE "FeishuChat" ADD COLUMN "isBlacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeishuChat" ADD COLUMN "blacklistedAt" TIMESTAMP(3);
