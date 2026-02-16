-- AlterTable: Add whitelist fields to FeishuChat
ALTER TABLE "FeishuChat" ADD COLUMN "isWhitelisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeishuChat" ADD COLUMN "whitelistedAt" TIMESTAMP(3);

-- CreateTable: AlertRule
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AlertSenderWhitelist
CREATE TABLE "AlertSenderWhitelist" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSenderWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertRule_isEnabled_idx" ON "AlertRule"("isEnabled");

-- CreateIndex
CREATE INDEX "AlertRule_signalType_idx" ON "AlertRule"("signalType");

-- CreateIndex
CREATE UNIQUE INDEX "AlertSenderWhitelist_senderId_key" ON "AlertSenderWhitelist"("senderId");

-- CreateIndex
CREATE INDEX "AlertSenderWhitelist_senderId_idx" ON "AlertSenderWhitelist"("senderId");
