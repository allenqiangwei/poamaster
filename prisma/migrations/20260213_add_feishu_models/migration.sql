-- CreateTable
CREATE TABLE "FeishuChat" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "memberCount" INTEGER,
    "lastMessage" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeishuChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeishuMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "msgType" TEXT NOT NULL,
    "rawData" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeishuMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeishuChat_chatId_key" ON "FeishuChat"("chatId");

-- CreateIndex
CREATE INDEX "FeishuChat_chatType_idx" ON "FeishuChat"("chatType");

-- CreateIndex
CREATE INDEX "FeishuChat_lastMessage_idx" ON "FeishuChat"("lastMessage");

-- CreateIndex
CREATE UNIQUE INDEX "FeishuMessage_messageId_key" ON "FeishuMessage"("messageId");

-- CreateIndex
CREATE INDEX "FeishuMessage_chatId_idx" ON "FeishuMessage"("chatId");

-- CreateIndex
CREATE INDEX "FeishuMessage_timestamp_idx" ON "FeishuMessage"("timestamp");

-- CreateIndex
CREATE INDEX "FeishuMessage_senderId_idx" ON "FeishuMessage"("senderId");

-- AddForeignKey
ALTER TABLE "FeishuMessage" ADD CONSTRAINT "FeishuMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FeishuChat"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
