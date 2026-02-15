-- CreateTable
CREATE TABLE "ChatSignal" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageIds" TEXT[],
    "relatedUser" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'batch',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDigest" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "keyTopics" TEXT[],
    "messageCount" INTEGER NOT NULL,
    "activeUsers" TEXT[],
    "signalCount" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPulse" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "activeUserCount" INTEGER NOT NULL DEFAULT 0,
    "sentimentScore" DOUBLE PRECISION,
    "avgResponseTime" DOUBLE PRECISION,
    "peakHour" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPulse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSignal_chatId_idx" ON "ChatSignal"("chatId");
CREATE INDEX "ChatSignal_signalType_idx" ON "ChatSignal"("signalType");
CREATE INDEX "ChatSignal_detectedAt_idx" ON "ChatSignal"("detectedAt");
CREATE INDEX "ChatSignal_isResolved_idx" ON "ChatSignal"("isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDigest_chatId_date_key" ON "ChatDigest"("chatId", "date");
CREATE INDEX "ChatDigest_date_idx" ON "ChatDigest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPulse_chatId_date_key" ON "TeamPulse"("chatId", "date");
CREATE INDEX "TeamPulse_date_idx" ON "TeamPulse"("date");

-- AddForeignKey
ALTER TABLE "ChatSignal" ADD CONSTRAINT "ChatSignal_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FeishuChat"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatDigest" ADD CONSTRAINT "ChatDigest_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FeishuChat"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamPulse" ADD CONSTRAINT "TeamPulse_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FeishuChat"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
