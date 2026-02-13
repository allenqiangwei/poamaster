-- AlterTable: Add isRenamed flag to FeishuChat
ALTER TABLE "FeishuChat" ADD COLUMN "isRenamed" BOOLEAN NOT NULL DEFAULT false;
