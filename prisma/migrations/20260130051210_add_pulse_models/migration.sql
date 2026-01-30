-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY', 'WEEKLY', 'OTHER');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EntryDimension" AS ENUM ('OVERALL_HEALTH', 'SCHEDULE', 'SCOPE', 'RISKS', 'BLOCKERS', 'DEPENDENCIES', 'QUALITY', 'RESOURCING', 'DECISIONS', 'KPI', 'PLAN_CREDIBILITY', 'ALIGNMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feishuUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dod" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "errorMessage" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftItem" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" TEXT,
    "decisionType" TEXT,
    "action" TEXT,
    "etaText" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "movedFrom" TEXT,
    "mergedFrom" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmedItem" (
    "id" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "decisionType" TEXT,
    "action" TEXT,
    "etaText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "smartFlags" JSONB,
    "pushedToTodo" BOOLEAN NOT NULL DEFAULT false,
    "todoTaskId" TEXT,
    "pushError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "parsedText" TEXT,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parseError" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseAnalysisSession" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "aiOutputRaw" JSONB NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseAnalysisSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dimension" "EntryDimension" NOT NULL,
    "title" TEXT NOT NULL,
    "evidenceCurrent" TEXT NOT NULL,
    "sourceCurrent" JSONB NOT NULL,
    "evidenceHistory" JSONB NOT NULL DEFAULT '[]',
    "embedding" DOUBLE PRECISION[],
    "deletedAt" TIMESTAMP(3),
    "deleteToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Assignee_name_key" ON "Assignee"("name");

-- CreateIndex
CREATE INDEX "Assignee_name_idx" ON "Assignee"("name");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");

-- CreateIndex
CREATE INDEX "Artifact_assigneeId_idx" ON "Artifact"("assigneeId");

-- CreateIndex
CREATE INDEX "Artifact_status_idx" ON "Artifact"("status");

-- CreateIndex
CREATE INDEX "Artifact_createdAt_idx" ON "Artifact"("createdAt");

-- CreateIndex
CREATE INDEX "DraftItem_artifactId_idx" ON "DraftItem"("artifactId");

-- CreateIndex
CREATE INDEX "DraftItem_dimension_idx" ON "DraftItem"("dimension");

-- CreateIndex
CREATE INDEX "ConfirmedItem_assigneeId_idx" ON "ConfirmedItem"("assigneeId");

-- CreateIndex
CREATE INDEX "ConfirmedItem_dimension_idx" ON "ConfirmedItem"("dimension");

-- CreateIndex
CREATE INDEX "ConfirmedItem_status_idx" ON "ConfirmedItem"("status");

-- CreateIndex
CREATE INDEX "ConfirmedItem_createdAt_idx" ON "ConfirmedItem"("createdAt");

-- CreateIndex
CREATE INDEX "ConfirmedItem_pushedToTodo_idx" ON "ConfirmedItem"("pushedToTodo");

-- CreateIndex
CREATE INDEX "PulseProject_updatedAt_idx" ON "PulseProject"("updatedAt");

-- CreateIndex
CREATE INDEX "PulseReport_projectId_idx" ON "PulseReport"("projectId");

-- CreateIndex
CREATE INDEX "PulseAnalysisSession_reportId_idx" ON "PulseAnalysisSession"("reportId");

-- CreateIndex
CREATE INDEX "PulseEntry_projectId_dimension_idx" ON "PulseEntry"("projectId", "dimension");

-- CreateIndex
CREATE INDEX "PulseEntry_deletedAt_idx" ON "PulseEntry"("deletedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Assignee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Assignee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftItem" ADD CONSTRAINT "DraftItem_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedItem" ADD CONSTRAINT "ConfirmedItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Assignee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmedItem" ADD CONSTRAINT "ConfirmedItem_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseReport" ADD CONSTRAINT "PulseReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PulseProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseAnalysisSession" ADD CONSTRAINT "PulseAnalysisSession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PulseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseEntry" ADD CONSTRAINT "PulseEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PulseProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
