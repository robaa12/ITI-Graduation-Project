-- Concurrency token for content generation. A queued job records the value it
-- was reserved with; the worker only writes its result while the row still
-- carries that value, so a job superseded by a newer regenerate or a manual
-- edit is discarded instead of overwriting the newer data.
ALTER TABLE "generated_content"
  ADD COLUMN "generationRevision" INTEGER NOT NULL DEFAULT 0;
