import { BadRequestException } from '@nestjs/common';

import { validateContentWorkflowInput } from './content-workflow-input.validator';

const validInput = {
  brandName: 'Shark & Sprout',
  product: 'Organic cotton baby tees',
  targetAudience: 'Eco-conscious parents',
  campaignStrategy: { summary: 'A launch campaign' },
  platforms: ['instagram', 'linkedin'],
  duration: '2 weeks',
  postsPerWeek: 3,
  requireApproval: false,
};

describe('validateContentWorkflowInput', () => {
  it('accepts a valid content workflow request', () => {
    expect(() => validateContentWorkflowInput(validInput)).not.toThrow();
  });

  it.each(['brandName', 'product', 'targetAudience'])(
    'rejects an empty %s before it reaches Mastra',
    (field) => {
      expect(() =>
        validateContentWorkflowInput({ ...validInput, [field]: '  ' }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects unsupported platforms', () => {
    expect(() =>
      validateContentWorkflowInput({ ...validInput, platforms: ['threads'] }),
    ).toThrow(BadRequestException);
  });
});
