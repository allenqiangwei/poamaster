-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'REVISED');

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "outcome" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "madeAt" TIMESTAMP(3) NOT NULL,
    "madeBy" TEXT,
    "reviewDate" TIMESTAMP(3),
    "notes" TEXT,
    "signalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add decisionId to Task
ALTER TABLE "Task" ADD COLUMN "decisionId" TEXT;

-- CreateIndex
CREATE INDEX "Decision_status_idx" ON "Decision"("status");

-- CreateIndex
CREATE INDEX "Decision_madeAt_idx" ON "Decision"("madeAt");

-- CreateIndex
CREATE INDEX "Decision_reviewDate_idx" ON "Decision"("reviewDate");

-- CreateIndex
CREATE INDEX "Task_decisionId_idx" ON "Task"("decisionId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
