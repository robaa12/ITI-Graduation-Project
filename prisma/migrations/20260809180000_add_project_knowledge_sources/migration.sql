-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('WEBSITE', 'DOCUMENT', 'FACEBOOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('PENDING', 'INDEXING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "knowledge_source" (
    "id" TEXT NOT NULL,
    "type" "KnowledgeSourceType" NOT NULL,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "metadata" JSONB,
    "error" TEXT,
    "indexedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_source_projectId_idx" ON "knowledge_source"("projectId");
CREATE INDEX "knowledge_source_projectId_status_idx" ON "knowledge_source"("projectId", "status");

-- AddForeignKey
ALTER TABLE "knowledge_source" ADD CONSTRAINT "knowledge_source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
