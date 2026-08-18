import { BadRequestException } from '@nestjs/common';

const SOCIAL_PLATFORMS = new Set([
  'x',
  'instagram',
  'linkedin',
  'facebook',
  'tiktok',
  'youtube_shorts',
]);

function requireNonBlankString(
  input: Record<string, unknown>,
  field: string,
): void {
  const value = input[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
}

/**
 * Guards Mastra's public workflow boundary before a job is persisted.
 * Mastra validates asynchronously after `/start` responds; malformed input can
 * otherwise terminate its dev-server child before Nest gets a useful error.
 */
export function validateContentWorkflowInput(
  input: Record<string, unknown>,
): void {
  requireNonBlankString(input, 'brandName');
  requireNonBlankString(input, 'product');
  requireNonBlankString(input, 'targetAudience');

  const campaignStrategy = input.campaignStrategy;
  if (
    !campaignStrategy ||
    typeof campaignStrategy !== 'object' ||
    Array.isArray(campaignStrategy)
  ) {
    throw new BadRequestException('campaignStrategy must be an object');
  }

  // `platforms`, `duration` and `postsPerWeek` are required rather than
  // optional. The pipeline would happily derive them from the strategy, but
  // they are exactly the three numbers that decide how many posts — and so how
  // many credits — a run costs, and a run whose size is unknown cannot be
  // priced honestly.
  const platforms = input.platforms;
  if (
    !Array.isArray(platforms) ||
    platforms.length === 0 ||
    platforms.some(
      (platform) =>
        typeof platform !== 'string' || !SOCIAL_PLATFORMS.has(platform),
    )
  ) {
    throw new BadRequestException(
      'platforms must contain at least one supported social platform',
    );
  }

  if (typeof input.duration !== 'string' || input.duration.trim().length === 0) {
    throw new BadRequestException('duration must be a non-empty string');
  }

  if (
    !Number.isInteger(input.postsPerWeek) ||
    Number(input.postsPerWeek) < 1 ||
    Number(input.postsPerWeek) > 20
  ) {
    throw new BadRequestException(
      'postsPerWeek must be an integer between 1 and 20',
    );
  }

  if (
    input.maxPosts !== undefined &&
    (!Number.isInteger(input.maxPosts) ||
      Number(input.maxPosts) < 1 ||
      Number(input.maxPosts) > 60)
  ) {
    throw new BadRequestException(
      'maxPosts must be an integer between 1 and 60',
    );
  }

  if (
    input.requireApproval !== undefined &&
    typeof input.requireApproval !== 'boolean'
  ) {
    throw new BadRequestException('requireApproval must be a boolean');
  }

  if (
    input.generateImages !== undefined &&
    typeof input.generateImages !== 'boolean'
  ) {
    throw new BadRequestException('generateImages must be a boolean');
  }
}
