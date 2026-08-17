UPDATE "plan"
SET
  "priceMonthlyCents" = 2500,
  "priceYearlyCents" = 25000,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'pro';

UPDATE "plan"
SET
  "priceMonthlyCents" = 5000,
  "priceYearlyCents" = 50000,
  "generationCredits" = 100,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'business';
