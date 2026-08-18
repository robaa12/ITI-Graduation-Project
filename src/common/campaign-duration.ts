/**
 * The one parser for the free-text `duration` a campaign brief carries
 * ("2 weeks", "10 days", "1 month"). Plan limits and credit pricing both read a
 * campaign's length, so they have to agree on what a length means — a second
 * copy of these constants is a second answer to "does this fit my plan?".
 *
 * Mirrored on the client by
 * `Ai-Content-Creation/src/features/generate/model/campaignPlanLimits.js`.
 */

export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;

/** Weeks in `value`, or null when it is not a duration this app understands. */
export function durationInWeeks(value: unknown): number | null {
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

export function formatWeeks(weeks: number): string {
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}
