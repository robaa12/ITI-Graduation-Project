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
};

const PRO: CampaignPlanLimits = {
  code: 'pro',
  name: 'Pro',
  maxCampaignWeeks: 3,
  maxPostsPerWeek: 6,
};

const BUSINESS: CampaignPlanLimits = {
  code: 'business',
  name: 'Business',
  maxCampaignWeeks: null,
  maxPostsPerWeek: null,
};

describe('validateCampaignPlanLimits', () => {
  it('accepts the Free ceiling', () => {
    expect(() =>
      validateCampaignPlanLimits({ duration: '1 week', postsPerWeek: 3 }, FREE),
    ).not.toThrow();
  });

  it.each([
    [{ duration: '2 weeks', postsPerWeek: 3 }, '1 week'],
    [{ duration: '1 week', postsPerWeek: 4 }, '3 posts per week'],
  ])('rejects a Free request above its limit', (input, message) => {
    expect(() => validateCampaignPlanLimits(input, FREE)).toThrow(message);
  });

  it('accepts the Pro ceiling and rejects longer campaigns', () => {
    expect(() =>
      validateCampaignPlanLimits({ duration: '3 weeks', postsPerWeek: 6 }, PRO),
    ).not.toThrow();
    expect(() =>
      validateCampaignPlanLimits({ duration: '1 month', postsPerWeek: 6 }, PRO),
    ).toThrow(BadRequestException);
  });

  it('does not add subscription caps to Business', () => {
    expect(() =>
      validateCampaignPlanLimits(
        { duration: '6 weeks', postsPerWeek: 20 },
        BUSINESS,
      ),
    ).not.toThrow();
  });
});
