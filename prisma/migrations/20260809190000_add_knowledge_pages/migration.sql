CREATE TABLE "knowledge_page" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "error" TEXT,
  "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knowledge_page_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_page_sourceId_url_key" ON "knowledge_page"("sourceId", "url");
CREATE INDEX "knowledge_page_sourceId_idx" ON "knowledge_page"("sourceId");

ALTER TABLE "knowledge_page"
  ADD CONSTRAINT "knowledge_page_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "knowledge_source"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
