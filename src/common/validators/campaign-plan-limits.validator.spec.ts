import { BadRequestException } from '@nestjs/common';

import {
  CampaignPlanLimits,
  validateCampaignPlanLimits,
} from './campaign-plan-limits.validator';

const FREE: CampaignPlanLimits = {
  code: 'free',
  name: 'Free',
  maxCampaignWeeks: 1,
  maxPostsPerWeek: 3,
  maxPlatforms: 1,
};

const PRO: CampaignPlanLimits = {
  code: 'pro',
  name: 'Pro',
  maxCampaignWeeks: 3,
  maxPostsPerWeek: 6,
  maxPlatforms: 3,
};

const BUSINESS: CampaignPlanLimits = {
  code: 'business',
  name: 'Business',
  maxCampaignWeeks: 4,
  maxPostsPerWeek: 20,
  maxPlatforms: 6,
};

const UNCAPPED: CampaignPlanLimits = {
  code: 'internal',
  name: 'Internal',
  maxCampaignWeeks: null,
  maxPostsPerWeek: null,
  maxPlatforms: null,
};

describe('validateCampaignPlanLimits', () => {
  it('accepts the Free ceiling', () => {
    expect(() =>
      validateCampaignPlanLimits(
        { duration: '1 week', postsPerWeek: 3, platforms: ['instagram'] },
        FREE,
      ),
    ).not.toThrow();
  });

  it.each([
    [{ duration: '2 weeks', postsPerWeek: 3 }, '1 week'],
    [{ duration: '1 week', postsPerWeek: 4 }, '3 posts per week'],
    [
      { duration: '1 week', postsPerWeek: 3, platforms: ['instagram', 'x'] },
      '1 platform per campaign',
    ],
  ])('rejects a Free request above its limit', (input, message) => {
    expect(() => validateCampaignPlanLimits(input, FREE)).toThrow(message);
  });

  it('accepts the Pro ceiling and rejects longer campaigns', () => {
    expect(() =>
      validateCampaignPlanLimits(
        {
          duration: '3 weeks',
          postsPerWeek: 6,
          platforms: ['instagram', 'x', 'linkedin'],
        },
        PRO,
      ),
    ).not.toThrow();
    expect(() =>
      validateCampaignPlanLimits({ duration: '1 month', postsPerWeek: 6 }, PRO),
    ).toThrow(BadRequestException);
  });

  it('rejects a fourth platform on Pro', () => {
    expect(() =>
      validateCampaignPlanLimits(
        {
          duration: '1 week',
          postsPerWeek: 1,
          platforms: ['instagram', 'x', 'linkedin', 'facebook'],
        },
        PRO,
      ),
    ).toThrow('up to 3 platforms per campaign');
  });

  it('accepts the Business ceiling and refuses to exceed it', () => {
    expect(() =>
      validateCampaignPlanLimits(
        {
          duration: '1 month',
          postsPerWeek: 20,
          platforms: [
            'instagram',
            'x',
            'linkedin',
            'facebook',
            'tiktok',
            'youtube_shorts',
          ],
        },
        BUSINESS,
      ),
    ).not.toThrow();
    expect(() =>
      validateCampaignPlanLimits({ duration: '6 weeks', postsPerWeek: 20 }, BUSINESS),
    ).toThrow('up to 4 weeks');
  });

  it('skips every check a plan leaves null', () => {
    expect(() =>
      validateCampaignPlanLimits(
        {
          duration: '6 weeks',
          postsPerWeek: 20,
          platforms: ['instagram', 'x', 'linkedin', 'facebook', 'tiktok'],
        },
        UNCAPPED,
      ),
    ).not.toThrow();
  });
});
