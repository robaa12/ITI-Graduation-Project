-- Platform count multiplies a campaign's output the same way duration and
-- cadence do, and images are the dominant per-post cost, so both become
-- plan-level entitlements rather than picker defaults.
ALTER TABLE "plan" ADD COLUMN "maxPlatforms" INTEGER;
ALTER TABLE "plan" ADD COLUMN "allowsImageGeneration" BOOLEAN NOT NULL DEFAULT true;

-- Business was uncapped on duration and cadence. With one credit now buying one
-- post, an uncapped plan is no longer a pricing risk, but the caps are what the
-- pricing page advertises, so they become real.
UPDATE "plan"
SET "maxPlatforms" = 1, "allowsImageGeneration" = false
WHERE "code" = 'free';

UPDATE "plan"
SET "maxPlatforms" = 3
WHERE "code" = 'pro';

UPDATE "plan"
SET "maxCampaignWeeks" = 4, "maxPostsPerWeek" = 20, "maxPlatforms" = 6
WHERE "code" = 'business';
