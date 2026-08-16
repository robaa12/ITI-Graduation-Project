ALTER TABLE "plan"
ADD COLUMN "maxCampaignWeeks" INTEGER,
ADD COLUMN "maxPostsPerWeek" INTEGER;

UPDATE "plan"
SET
  "generationCredits" = 4,
  "maxCampaignWeeks" = 1,
  "maxPostsPerWeek" = 3,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'free';

UPDATE "plan"
SET
  "generationCredits" = 40,
  "maxCampaignWeeks" = 3,
  "maxPostsPerWeek" = 6,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'pro';

UPDATE "plan"
SET
  "maxCampaignWeeks" = NULL,
  "maxPostsPerWeek" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'business';
