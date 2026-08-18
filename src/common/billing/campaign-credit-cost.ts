import { BadRequestException } from '@nestjs/common';

import { durationInWeeks } from '../campaign-duration';

/**
 * What a generation costs in credits.
 *
 * One credit buys one unit of generated work: a strategy, a single post, or a
 * regeneration. A content run therefore costs one credit per post it will
 * produce, because the pipeline spends real money per post — it generates one
 * image for every post (`marketing-workflow-demo/src/workflows/content/workflow.ts`,
 * `generate-visuals`), and images dominate the marginal cost of a campaign.
 *
 * Charging a flat credit per run instead would let a single credit buy an
 * arbitrarily large campaign, which is what made the plan allowances unable to
 * bound cost at all.
 */

export const STRATEGY_CREDIT_COST = 1;
export const STRATEGY_REVISION_CREDIT_COST = 1;
export const CONTENT_ITEM_CREDIT_COST = 1;

/**
 * The number of posts a content run will generate, which is also the number of
 * images it will buy. Mirrors the pipeline's own arithmetic:
 *
 *   postCount = postsPerWeek * weeks
 *   requested = postCount * platforms.length
 *
 * The three inputs are required rather than defaulted: the pipeline would
 * happily derive them from the strategy, but a run whose size is unknown cannot
 * be priced, and guessing on the low side gives away the expensive half.
 */
export function contentRunPostCount(input: Record<string, unknown>): number {
  const weeks = durationInWeeks(input.duration);
  if (weeks === null) {
    throw new BadRequestException(
      'duration must be expressed in days, weeks, or months to price this run',
    );
  }

  const postsPerWeek = Number(input.postsPerWeek);
  if (!Number.isInteger(postsPerWeek) || postsPerWeek < 1) {
    throw new BadRequestException(
      'postsPerWeek must be a positive integer to price this run',
    );
  }

  const platforms = input.platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new BadRequestException(
      'platforms must list at least one platform to price this run',
    );
  }

  // A part-week still produces posts, so round up rather than truncating a
  // "10 days" campaign down to one week of billing.
  return Math.max(1, Math.ceil(weeks * postsPerWeek) * platforms.length);
}

/** Credits a content run costs. One per post it will generate. */
export function contentRunCreditCost(input: Record<string, unknown>): number {
  return contentRunPostCount(input);
}
