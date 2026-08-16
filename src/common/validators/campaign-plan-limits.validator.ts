import { BadRequestException } from '@nestjs/common';

export type CampaignPlanLimits = {
  code: string;
  name: string;
  maxCampaignWeeks: number | null;
  maxPostsPerWeek: number | null;
};

const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH = 4;

/**
 * Enforces subscription entitlements at the API boundary. The frontend mirrors
 * these limits for a friendly picker, but this check remains authoritative.
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
}

function durationInWeeks(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  switch (match[2]) {
    case 'day':
    case 'days':
      return amount / DAYS_PER_WEEK;
    case 'month':
    case 'months':
      return amount * WEEKS_PER_MONTH;
    default:
      return amount;
  }
}

function formatWeeks(weeks: number): string {
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}
