import { BadRequestException } from '@nestjs/common';

import { durationInWeeks, formatWeeks } from '../campaign-duration';

export type CampaignPlanLimits = {
  code: string;
  name: string;
  maxCampaignWeeks: number | null;
  maxPostsPerWeek: number | null;
  maxPlatforms: number | null;
};

/**
 * Enforces subscription entitlements at the API boundary. The frontend mirrors
 * these limits for a friendly picker, but this check remains authoritative.
 *
 * All three caps shape one campaign, and they multiply: the pipeline generates
 * `weeks * postsPerWeek * platforms` posts. Capping duration and cadence while
 * leaving platforms open would let a plan's real output grow sixfold, so
 * `maxPlatforms` belongs here rather than being left to the picker.
 */
export function validateCampaignPlanLimits(
  input: Record<string, unknown>,
  plan: CampaignPlanLimits,
): void {
  if (plan.maxCampaignWeeks !== null && input.duration !== undefined) {
    const weeks = durationInWeeks(input.duration);
    if (weeks === null) {
      throw new BadRequestException(
        'duration must be expressed in days, weeks, or months',
      );
    }
    if (weeks > plan.maxCampaignWeeks) {
      throw new BadRequestException(
        `${plan.name} supports campaigns up to ${formatWeeks(plan.maxCampaignWeeks)}. Upgrade your plan to use a longer duration.`,
      );
    }
  }

  if (
    plan.maxPostsPerWeek !== null &&
    input.postsPerWeek !== undefined &&
    Number(input.postsPerWeek) > plan.maxPostsPerWeek
  ) {
    throw new BadRequestException(
      `${plan.name} supports up to ${plan.maxPostsPerWeek} posts per week. Upgrade your plan to create more posts.`,
    );
  }

  if (
    plan.maxPlatforms !== null &&
    Array.isArray(input.platforms) &&
    input.platforms.length > plan.maxPlatforms
  ) {
    throw new BadRequestException(
      `${plan.name} supports up to ${plan.maxPlatforms} ${plan.maxPlatforms === 1 ? 'platform' : 'platforms'} per campaign. Upgrade your plan to publish to more.`,
    );
  }
}
